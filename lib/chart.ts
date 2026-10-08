import type { ChartSpec, Row } from './types';
import { numericValue, sumNumbers } from './table';

export function buildChartData(rows: Row[], spec: ChartSpec): { name: string; value: number }[] {
  // Embedded model data is only allowed for the free-text source.
  if (!rows.length) return spec.data ?? [];
  if (!spec.xKey || !rows.some((row) => Object.hasOwn(row, spec.xKey!))) return [];

  const xKey = spec.xKey!;
  const yKey = spec.yKey || null;
  const agg = spec.aggregation ?? 'count';

  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const raw = row[xKey];
    const key = raw === null || raw === undefined || String(raw).trim() === '' ? '—' : String(raw).trim();
    const num = yKey ? numericValue(row[yKey]) : null;
    if (agg !== 'count' && num === null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(agg === 'count' ? 1 : num!);
  }

  let points = Array.from(groups.entries()).map(([name, vals]) => {
    let value: number;
    if (agg === 'sum') value = sumNumbers(vals);
    else if (agg === 'avg') value = sumNumbers(vals) / vals.length;
    else value = vals.length;
    return { name, value: value * (spec.valueScale ?? 1) };
  });

  if (spec.type === 'line' || spec.type === 'area') {
    points.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  } else {
    points.sort((a, b) => spec.order === 'asc' ? a.value - b.value : b.value - a.value);
  }

  if (spec.limit && points.length > spec.limit) {
    if (spec.includeOther) {
      const keep = Math.max(1, spec.limit - 1);
      points = [...points.slice(0, keep), { name: 'Остальные', value: sumNumbers(points.slice(keep).map((point) => point.value)) }];
    } else points = points.slice(0, spec.limit);
  }
  return points.map((point) => ({ name: spec.labels?.[point.name] ?? point.name, value: Math.round(point.value * 100) / 100 }));
}
