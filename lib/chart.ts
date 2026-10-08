import type { ChartSpec, Row } from './types';

export function buildChartData(rows: Row[], spec: ChartSpec): { name: string; value: number }[] {
  if (spec.data?.length) return spec.data;

  const xKey = spec.xKey!;
  const yKey = spec.yKey || null;
  const agg = spec.aggregation ?? 'count';

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const raw = row[xKey];
    const key = raw === null || raw === undefined || String(raw).trim() === '' ? '—' : String(raw).trim();
    const num = yKey ? Number(row[yKey]) : NaN;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(Number.isFinite(num) ? num : 1);
  }

  let points = Array.from(groups.entries()).map(([name, vals]) => {
    let value: number;
    if (agg === 'sum') value = vals.reduce((a, b) => a + b, 0);
    else if (agg === 'avg') value = vals.reduce((a, b) => a + b, 0) / vals.length;
    else value = vals.length;
    return { name, value: Math.round(value * 100) / 100 };
  });

  if (spec.type === 'line' || spec.type === 'area') {
    points.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  } else {
    points.sort((a, b) => b.value - a.value);
  }

  if (spec.limit && points.length > spec.limit) points = points.slice(0, spec.limit);
  return points;
}