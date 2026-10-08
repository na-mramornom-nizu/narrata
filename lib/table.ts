import type { Analysis, ChartSpec, Dataset } from './types';

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

export function analyzeTable(dataset: Dataset): Analysis {
  const numeric = numericColumns(dataset);
  const category = dataset.columns.find((column) => !numeric.includes(column));
  // Identifiers can be numeric but summing them does not describe the data.
  const metric = numeric.find((column) => !/^(id|index|код|идентификатор)$/i.test(column) && !/(?:^|[_\s-])(id|code)$/i.test(column.replace(/([a-z])([A-Z])/g, '$1_$2')));
  const charts: ChartSpec[] = [];
  if (category && metric) {
    charts.push(
      { type: 'bar', title: `Наибольшие значения «${metric}»`, subtitle: `Сумма по «${category}» · все строки файла`, xKey: category, yKey: metric, aggregation: 'sum', order: 'desc', limit: 10 },
      { type: 'bar', title: `Наименьшие значения «${metric}»`, subtitle: `Сумма по «${category}» · все строки файла`, xKey: category, yKey: metric, aggregation: 'sum', order: 'asc', limit: 10 },
    );
  } else if (category) {
    charts.push({ type: 'bar', title: `Количество записей по «${category}»`, xKey: category, aggregation: 'count', order: 'desc', limit: 10 });
  } else if (metric) {
    charts.push({ type: 'bar', title: `Частота значений «${metric}»`, xKey: metric, aggregation: 'count', order: 'desc', limit: 10 });
  }
  if (!metric) return {
    headline: `В таблице ${formatNumber(dataset.rows.length)} записей`,
    narrative: 'Показано количество записей по категориям. Числовых показателей для расчёта суммы и среднего нет; идентификаторы не суммируются.',
    insights: [{ label: 'Строк', value: formatNumber(dataset.rows.length) }, { label: 'Колонок', value: String(dataset.columns.length) }],
    charts,
  };
  const stats = columnStats(dataset, metric);
  return {
    headline: `Обзор ${formatNumber(dataset.rows.length)} записей по «${metric}»`,
    narrative: `По всем строкам файла сумма «${metric}» равна ${formatNumber(stats.sum)}, среднее — ${formatNumber(stats.average!)}. Диапазон значений: от ${formatNumber(stats.min!)} до ${formatNumber(stats.max!)}.${stats.missing ? ` Пустых значений: ${stats.missing}; они исключены из расчётов.` : ''} Единицы и период берутся только из обозначений в файле.`,
    insights: [
      { label: 'Строк', value: formatNumber(dataset.rows.length) },
      { label: `Сумма · ${metric}`, value: formatNumber(stats.sum) },
      { label: `Среднее · ${metric}`, value: formatNumber(stats.average!) },
    ],
    charts,
  };
}
