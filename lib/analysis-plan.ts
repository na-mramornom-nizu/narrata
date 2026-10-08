import type { Analysis, ChartSpec, ChartType, Dataset } from './types';
import { columnStats, formatNumber, numericColumns, sumNumbers } from './table';
import { buildChartData } from './chart';

type Fact = { id: string; meaning: string; value: string };
type View = { id: string; meaning: string; types: ChartType[]; spec: ChartSpec; points: { name: string; value: number }[] };
export type AnalysisContext = { source: string; rows: number; columns: string[]; facts: Fact[]; views: View[] };
const identifier = (column: string) => /(^|[_\s-])(id|index|code|код|идентификатор)$/i.test(column.replace(/([a-z])([A-Z])/g, '$1_$2'));

// Facts and chart candidates are computed from every source row. The model
// selects the story and visual form; it never supplies calculated chart values.
export function prepareAnalysis(dataset: Dataset): AnalysisContext {
  const context: AnalysisContext = { source: dataset.name, rows: dataset.rows.length, columns: dataset.columns, facts: [], views: [] };
  const fact = (meaning: string, value: number, suffix = '') => {
    const id = `f${context.facts.length}`;
    context.facts.push({ id, meaning, value: `${formatNumber(value)}${suffix}` });
    return id;
  };
  const view = (meaning: string, spec: ChartSpec, types: ChartType[]) => {
    const points = buildChartData(dataset.rows, spec);
    if (!points.length) return;
    context.views.push({ id: `v${context.views.length}`, meaning, types, spec, points });
  };
  fact('Всего записей', dataset.rows.length);
  const numeric = numericColumns(dataset).filter((column) => !identifier(column));
  const unique = (column: string) => [...new Set(dataset.rows.map((row) => String(row[column] ?? '').trim()).filter(Boolean))];
  const temporal = dataset.columns.filter((column) => {
    const values = unique(column);
    return values.length > 1 && values.every((value) => /^\d{4}-\d{2}(?:-\d{2}(?:T.*)?)?$/.test(value));
  });
  const categories = dataset.columns.filter((column) => !identifier(column) && !temporal.includes(column) && (!numeric.includes(column) || (unique(column).length <= 12 && dataset.rows.length >= unique(column).length * 2)));
  const smallCategories = categories.filter((column) => {
    const values = unique(column);
    return values.length >= 2 && values.length < dataset.rows.length && values.length <= 60
      && values.every(value => value.length < 160 && !/https?:|[{}]/.test(value));
  }).sort((a, b) => Number(unique(a).length > 12) - Number(unique(b).length > 12)).slice(0, 8);
  const metrics = numeric.filter((column) => unique(column).length > 12 || unique(column).every((value) => ['0', '1'].includes(value)) || !categories.includes(column)).slice(0, 6);
  // Small numeric datasets still have meaningful measures, even with few values.
  if (!metrics.length) metrics.push(...numeric.filter((column) => !temporal.includes(column)).slice(0, 3));
  for (const column of numeric.slice(0, 10)) {
    const stats = columnStats(dataset, column);
    for (const [name, value] of Object.entries(stats)) if (value !== null) fact(`${column}: ${name}`, value);
    if (unique(column).every((value) => ['0', '1'].includes(value)) && stats.count) fact(`${column}: доля значений 1 среди заполненных (не доля среди всех при пропусках)`, stats.sum / stats.count * 100, '%');
  }
  for (const column of smallCategories) {
    const spec: ChartSpec = { type: 'bar', title: '', xKey: column, aggregation: 'count', limit: 12 };
    const points = buildChartData(dataset.rows, spec);
    for (const point of points) {
      fact(`${column} = ${point.name}: число записей`, point.value);
      fact(`${column} = ${point.name}: доля всех записей`, point.value / dataset.rows.length * 100, '%');
    }
    view(`Число записей по ${column}`, spec, points.length <= 7 ? ['bar', 'pie'] : ['bar']);
  }
  const grouping = smallCategories.length ? smallCategories.slice(0, 4) : categories.filter((column) => !numeric.includes(column)).slice(0, 1);
  for (const metric of metrics) {
    const binary = unique(metric).every((value) => ['0', '1'].includes(value));
    for (const category of grouping) {
      if (category === metric) continue;
      const low = unique(category).length <= 12;
      const aggregation = binary || low ? 'avg' : 'sum';
      const spec: ChartSpec = { type: 'bar', title: '', xKey: category, yKey: metric, aggregation, limit: 10, ...(binary ? { valueScale: 100, valueSuffix: '%' } : {}) };
      const points = buildChartData(dataset.rows, { ...spec, limit: undefined });
      const meaning = `${binary ? 'Доля значений 1 (%)' : aggregation === 'avg' ? 'Среднее' : 'Сумма'} ${metric} по ${category}`;
      view(meaning, spec, ['bar']);
      for (const point of points.slice(0, 10)) fact(`${meaning}: ${point.name}`, point.value, binary ? '%' : '');
      if (aggregation === 'sum' && points.every((point) => point.value >= 0) && points.length > 1) {
        const total = sumNumbers(points.map((point) => point.value));
        if (total > 0) {
          for (const point of points.slice(0, 5)) fact(`Доля ${category} = ${point.name} в общей сумме ${metric}`, point.value / total * 100, '%');
          for (const count of [2, 3]) if (points.length >= count) fact(`Совокупная доля первых ${count} категорий (${points.slice(0, count).map(p => p.name).join(', ')}) в общей сумме ${metric}`, sumNumbers(points.slice(0, count).map(p => p.value)) / total * 100, '%');
          fact(`Доля первых ${Math.min(5, points.length)} категорий ${category} в общей сумме ${metric}`, sumNumbers(points.slice(0, 5).map((point) => point.value)) / total * 100, '%');
          view(`Доли ${metric}: крупнейшие категории и остальные вместе, полная сумма`, { ...spec, type: 'pie', limit: 6, includeOther: true }, ['pie']);
        }
      }
    }
    for (const time of temporal.slice(0, 1)) {
      if (time === metric) continue;
      const monthly = unique(time).every(value => /^\d{4}-\d{2}$/.test(value));
      const meaning = `Изменение среднего ${metric} во времени (${time}), ${monthly ? 'месячные данные в формате год-месяц, не кварталы' : 'первые периоды по хронологии'}`;
      const spec: ChartSpec = { type: 'line', title: '', xKey: time, yKey: metric, aggregation: 'avg', limit: 12 };
      const points = buildChartData(dataset.rows, spec);
      if (points.length > 1) {
        const first = points[0], last = points.at(-1)!;
        fact(`${meaning}: разница ${last.name} минус ${first.name}`, last.value - first.value);
        if (first.value > 0) fact(`${meaning}: изменение от ${first.name} до ${last.name} в процентах`, (last.value - first.value) / first.value * 100, '%');
      }
      view(meaning, spec, ['line', 'area']);
    }
  }
  if (!context.views.length && categories[0]) view(`Частота ${categories[0]}`, { type: 'bar', title: '', xKey: categories[0], aggregation: 'count', limit: 10 }, ['bar']);
  return context;
}

export function resolveAnalysis(value: unknown, context: AnalysisContext): Analysis {
  const fail = (message: string): never => { throw new Error(message); };
  if (!value || typeof value !== 'object') return fail('Нужен JSON-объект');
  const input = value as any;
  const facts = new Map(context.facts.map((fact) => [fact.id, fact.value]));
  const prose = (raw: unknown): string => {
    if (typeof raw !== 'string' || !raw.trim()) return fail('Нужен непустой текст');
    let value: string = raw;
    // Remove unsupported currency embellishments; retain the source magnitude.
    const sourceUnits = context.columns.join(' ');
    if (!/\$|USD|доллар/i.test(sourceUnits)) value = value.replace(/\$/g, '').replace(/\s*доллар(?:ов|ах|ами|а|ы)?(?:\s+США)?/gi, '');
    if (!/€|EUR|евро/i.test(sourceUnits)) value = value.replace(/€/g, '').replace(/\s*евро/gi, '');
    value = value.replace(/\(\s*\)/g, '').replace(/ +/g, ' ').trim();
    const withoutReferences = value.replace(/\{\{f\d+\}\}/g, '');
    const numbers = (text: string) => text.match(/[-+]?\d(?:[\d \u00a0]*\d)?(?:[.,]\d+)?/g) ?? [];
    const normalize = (text: string) => text.replace(/[\s\u00a0]/g, '').replace(',', '.');
    const allowed = new Set([...context.facts.flatMap((fact) => numbers(fact.value).map(normalize)), ...context.views.map((view) => String(view.spec.limit)), ...context.views.flatMap(view => view.points.flatMap(point => numbers(point.name).map(normalize)))]);
    if (numbers(withoutReferences).some((number) => !allowed.has(normalize(number)))) return fail('Числа нужно копировать точно из facts.value, без новых вычислений и округлений');
    if (/[=]|\}\}\s*[-+*/]|\}\}\s*\{\{/.test(value)) return fail('Нужны связные предложения без формул');
    if ((/\$|доллар/i.test(value) && !/\$|USD|доллар/i.test(sourceUnits)) || (/€|евро/i.test(value) && !/€|EUR|евро/i.test(sourceUnits))) return fail('Не указывай валюту: она отсутствует в заголовках источника');
    return value.replace(/\{\{(f\d+)\}\}/g, (_, id) => facts.get(id) ?? fail(`Неизвестный факт ${id}`));
  };
  const headline = prose(input.headline);
  if (/^обзор\b/i.test(headline) || /записей по|записи по/i.test(headline)) return fail('Заголовок должен сообщать инсайт, а не структуру таблицы');
  const narrative = prose(input.narrative);
  for (const sentence of narrative.split(/(?<=[.!?])\s+/)) {
    const majority = sentence.match(/(?:большинство|более половины|больше половины)[^.!?%]{0,35}?(\d+(?:[.,]\d+)?)\s*%/i);
    if (majority && Number(majority[1].replace(',', '.')) <= 50) return fail('Доля менее или равная 50% не является большинством. Укажи точный процент без слова большинство.');
  }
  const sentences = narrative.replace(/(млрд|млн|тыс|руб|долл)\.(?=\s+[а-яё(])/g, '$1').split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2 || sentences.length > 3 || !/[.!?]$/.test(narrative)) return fail('Нарратив должен содержать 2–3 законченных предложения');
  if (!Array.isArray(input.insights)) return fail('Нужен список показателей');
  const insights = input.insights.filter((insight: any) => facts.has(insight.fact)).slice(0, 3).map((insight: any) => ({ label: prose(insight.label), value: facts.get(insight.fact)! }));
  const minimum = Math.min(2, context.views.length);
  if (!Array.isArray(input.charts) || input.charts.length < minimum || input.charts.length > 3) return fail('Выбери 2–3 графика');
  const used = new Set<string>();
  const charts = input.charts.map((chart: any): ChartSpec => {
    const view = context.views.find((item) => item.id === chart.view);
    if (!view || !view.types.includes(chart.type) || used.has(view.id)) return fail('Неверный или повторный view/type');
    used.add(view.id);
    const labels: Record<string, string> = {};
    for (const point of view.points) {
      const label = chart.labels?.[point.name];
      if (typeof label === 'string' && label.trim() && label.length <= 150) labels[point.name] = label.trim();
    }
    if (new Set(view.points.map((p) => labels[p.name] ?? p.name)).size !== view.points.length) return fail('Подписи разных категорий должны различаться');
    const subtitle = view.spec.valueSuffix === '%' ? 'Доля внутри каждой группы, %'
      : view.spec.includeOther ? 'Крупнейшие категории и остальные · полная сумма'
      : view.spec.aggregation === 'count' ? 'Количество записей по категориям'
      : chart.type === 'line' || chart.type === 'area' ? 'Средние значения в хронологическом порядке'
      : view.spec.aggregation === 'avg' ? 'Среднее значение внутри каждой группы' : 'Крупнейшие значения · сумма по категориям';
    return { ...view.spec, type: chart.type, title: prose(chart.title), subtitle, labels };
  });
  return { headline, narrative, insights, charts };
}
