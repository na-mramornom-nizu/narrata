import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Dataset, Row } from './types';

export class FileInputError extends Error {}
const empty = () => new FileInputError('В файле нет записей для анализа. Добавьте строки под заголовками и загрузите файл снова.');

export async function parseFile(file: File): Promise<Dataset> {
  if (!file.size) throw empty();
  if (file.size > 20 * 1024 * 1024) throw new FileInputError('Файл больше 20 МБ. Разделите таблицу на несколько файлов и загрузите нужную часть.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (ext === 'csv' || file.type === 'text/csv') {
    const bytes = new Uint8Array(buffer);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch {
      const high = bytes.filter(value => value >= 192).length / bytes.length;
      const russian = new TextDecoder('windows-1251').decode(bytes);
      text = high > 0.05 && /[А-Яа-яЁё]{3,}/.test(russian) ? russian : new TextDecoder('windows-1252').decode(bytes);
    }
    if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new FileInputError('Этот файл не похож на текстовую CSV-таблицу. Откройте исходный файл и сохраните его заново в CSV или Excel.');
    return parseCSV(text, file.name);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    try { return parseExcel(buffer, file.name); }
    catch (error) { if (error instanceof FileInputError) throw error; throw new FileInputError('Не удалось прочитать книгу Excel. Проверьте, что она открывается, и сохраните новую копию без защиты паролем.'); }
  }
  throw new FileInputError('Этот формат не поддерживается. Выберите CSV или Excel (.xlsx, .xls).');
}

export function parseCSV(text: string, name: string): Dataset {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', dynamicTyping: false });
  const broken = result.errors.find(error => error.type === 'Quotes');
  if (broken) throw new FileInputError('В CSV нарушены кавычки: часть строк не удаётся отделить друг от друга. Сохраните таблицу заново в CSV и повторите загрузку.');
  const data = result.data.map(row => row.map(value => value.trim()));
  if (data.length < 2) throw empty();
  let headers = data.shift()!;
  // Remove an empty trailing field created by a delimiter at the end of every row.
  while (headers.length && !headers.at(-1) && data.every(row => !row[headers.length - 1])) {
    const index = headers.length - 1; headers.pop(); data.forEach(row => row.splice(index, 1));
  }
  if (!headers.length) throw empty();
  const second = data[0];
  const translatedHeader = headers.filter(Boolean).length > 1 && second.length === headers.length
    && second.filter(value => /[А-Яа-яЁё]/.test(value)).length >= headers.length / 2
    && second.some(value => /^(название|наименование|код|номер|административный)/i.test(value))
    && headers.some(value => /^(name|id|global_id|area)$/i.test(value));
  const groupedHeader = headers.filter(value => !value).length > headers.length / 4
    && !second[0] && second.filter(Boolean).length > headers.length / 2;
  if (translatedHeader) headers = data.shift()!;
  else if (groupedHeader) {
    const children = data.shift()!;
    let parent = '';
    headers = headers.map((header, index) => {
      if (header) parent = header;
      const child = children[index];
      return child && child !== 'Response' ? `${parent} — ${child}` : header || parent;
    });
  }
  const seen = new Map<string, number>();
  const columns = headers.map((header, index) => {
    const base = header || `Колонка ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1; seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  if (!data.length) throw empty();
  const rows: Row[] = data.map((row, index) => {
    if (row.length !== columns.length) throw new FileInputError(`В строке ${index + 2} количество ячеек отличается от заголовка. Проверьте разделители и сохраните CSV заново.`);
    return Object.fromEntries(columns.map((column, i) => [column, row[i] || null]));
  });
  return { rows, columns, source: 'file', name };
}

function parseExcel(buffer: ArrayBuffer, name: string): Dataset {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw empty();
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: false });
  if (!rows.length) throw empty();
  return { rows, columns: Object.keys(rows[0]), source: 'file', name };
}

export function datasetFromText(text: string): Dataset {
  if (!text.trim()) throw new FileInputError('Добавьте текст отчета, чтобы начать анализ.');
  return { rows: [], columns: [], rawText: text.trim(), source: 'text', name: 'Вставленный текст' };
}
