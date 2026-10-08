import type { Dataset } from './types';

// Empty or invalid cells must never silently become zero (or one).
export function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export const formatNumber = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export function sumNumbers(values: number[]): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return sum;
}

export function numericColumns(dataset: Dataset): string[] {
  return dataset.columns.filter((column) => {
    const present = dataset.rows.map((row) => row[column]).filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
    return present.length > 0 && present.every((value) => numericValue(value) !== null);
  });
}

export function columnStats(dataset: Dataset, column: string) {
  const values = dataset.rows.map((row) => numericValue(row[column])).filter((value): value is number => value !== null);
  const sum = sumNumbers(values);
  return {
    count: values.length,
    missing: dataset.rows.length - values.length,
    sum,
    average: values.length ? sum / values.length : null,
    min: values.length ? values.reduce((a, b) => Math.min(a, b)) : null,
    max: values.length ? values.reduce((a, b) => Math.max(a, b)) : null,
  };
}

// The model plans a query; the executor always reads the entire original table.
// This catalog helps resolve names/translations, without putting every numeric row in the prompt.
export function tableContext(dataset: Dataset): string {
  const numeric = new Set(numericColumns(dataset));
  let remainingCharacters = 40_000;
  const records = [];
  for (const row of dataset.rows) {
    const record = dataset.columns.map((column) => row[column] ?? null);
    const size = JSON.stringify(record).length;
    if (size > remainingCharacters) break;
    records.push(record);
    remainingCharacters -= size;
  }
  return JSON.stringify({
    source: dataset.name,
    rowCount: dataset.rows.length,
    columns: dataset.columns.map((name) => {
      if (numeric.has(name)) return { name, type: 'number', statistics: columnStats(dataset, name) };
      const values = [...new Set(dataset.rows.map(row => String(row[name] ?? '').trim()).filter(Boolean))];
      return { name, type: 'text', ...(values.length <= 100 && values.every(value => value.length <= 120) ? { values } : {}) };
    }),
    recordColumns: dataset.columns,
    records,
    recordsComplete: records.length === dataset.rows.length,
  });
}
