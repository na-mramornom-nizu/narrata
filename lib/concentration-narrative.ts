import { buildChartData } from './chart';
import { formatNumber, sumNumbers } from './table';
import type { Dataset, ChartSpec } from './types';

// A verified concentration finding: the model translates names, not arithmetic
// or the relationship between the headline and its supporting percentages.
export function concentrationFinding(dataset: Dataset, spec?: ChartSpec) {
  if (!spec || spec.aggregation !== 'sum') return null;
  const points = buildChartData(dataset.rows, { ...spec, limit: undefined, includeOther: false, labels: undefined }).sort((a, b) => b.value - a.value);
  if (points.length <= 5 || points.some(p => p.value < 0)) return null;
  const total = sumNumbers(points.map(p => p.value));
  const five = sumNumbers(points.slice(0, 5).map(p => p.value));
  if (total <= 0 || five / total <= 0.5) return null;
  return { metric: spec.yKey!, category: spec.xKey!, leaders: points.slice(0, 3).map(p => p.name), threeShare: formatNumber(sumNumbers(points.slice(0, 3).map(p => p.value)) / total * 100), fiveShare: formatNumber(five / total * 100) };
}

export function renderConcentration(finding: NonNullable<ReturnType<typeof concentrationFinding>>, labels: { metric: string; groups: string; leaders: string[] }) {
  return {
    headline: `На пять ${labels.groups} приходится больше половины ${labels.metric} в выборке`,
    narrative: `Пять крупнейших ${labels.groups} обеспечивают ${finding.fiveShare}% суммарного ${labels.metric} в загруженной выборке. ${labels.leaders.slice(0, -1).join(', ')} и ${labels.leaders.at(-1)} вместе дают ${finding.threeShare}% этой суммы.`,
  };
}
