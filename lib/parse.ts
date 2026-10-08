import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Dataset, Row } from './types';

export async function parseFile(file: File): Promise<Dataset> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || file.type === 'text/csv') return parseCSV(await file.text(), file.name);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(await file.arrayBuffer(), file.name);
  throw new Error('Неподдерживаемый формат. Используйте .csv, .xlsx или .xls');
}

function parseCSV(text: string, name: string): Dataset {
  const res = Papa.parse<Row>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (!res.data.length) throw new Error('CSV пустой или не удалось распарсить');
  const rows = res.data.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) out[String(k).trim()] = typeof v === 'string' ? v.trim() : v;
    return out;
  });
  const columns = (res.meta.fields ?? Object.keys(rows[0])).map((f) => f.trim());
  return { rows, columns, source: 'file', name };
}

function parseExcel(buf: ArrayBuffer, name: string): Dataset {
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: false });
  if (!json.length) throw new Error('В таблице нет строк');
  const columns = Object.keys(json[0]);
  return { rows: json, columns, source: 'file', name };
}

export function datasetFromText(text: string): Dataset {
  return { rows: [], columns: [], rawText: text, source: 'text', name: 'Вставленный текст' };
}