const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareAnalysis, narrativeFacts } = require('../lib/analysis-plan.ts');
const { concentrationFinding, renderConcentration } = require('../lib/concentration-narrative.ts');

test('concentration headline and prose share the same computed evidence', () => {
  const dataset = { name: 'sales.csv', columns: ['Shop', 'Sales'], rows: Array.from({ length: 20 }, (_, i) => ({ Shop: `Shop ${i}`, Sales: i < 5 ? 100 : 1 })) };
  const spec = { type: 'bar', xKey: 'Shop', yKey: 'Sales', aggregation: 'sum', limit: 10 };
  const finding = concentrationFinding(dataset, spec);
  assert.equal(finding.fiveShare, '97,09');
  assert.equal(finding.threeShare, '58,25');
  const text = renderConcentration(finding, { metric: 'выручки', groups: 'магазинов', leaders: ['А', 'Б', 'В'] });
  assert.match(text.headline, /пять магазинов.*больше половины выручки/);
  assert.match(text.narrative, /97,09%.*58,25%/);
  dataset.rows.forEach(row => { row.Sales = 1; });
  assert.equal(concentrationFinding(dataset, spec), null);
});

test('narrative concentration includes groups outside a top-ten chart', () => {
  const dataset = { name: 'sales.csv', columns: ['Shop', 'Sales'], rows: Array.from({ length: 20 }, (_, i) => ({ Shop: `Shop ${i}`, Sales: 20 - i })) };
  const view = prepareAnalysis(dataset).views.find(v => v.spec.aggregation === 'sum');
  assert.equal(view.points.length, 10);
  const facts = narrativeFacts(dataset, view);
  assert.equal(facts.find(f => f.meaning.startsWith('Совокупная доля 3 ')).value, '27,14%');
  assert.equal(facts.find(f => f.meaning.startsWith('Число групп')).value, '20');
  assert.ok(!facts.some(f => f.meaning.includes('Shop 9')));
  assert.ok(!facts.some(f => f.meaning.includes('минимум')));
});

test('rates use all source rows for the overall rate rather than averaging group rates', () => {
  const dataset = { name: 'outcomes.csv', columns: ['Group', 'Outcome'], rows: [{ Group: 'A', Outcome: 1 }, { Group: 'B', Outcome: 1 }, { Group: 'B', Outcome: 0 }, { Group: 'B', Outcome: 0 }] };
  const view = prepareAnalysis(dataset).views.find(v => v.spec.yKey === 'Outcome');
  const facts = narrativeFacts(dataset, view);
  assert.equal(facts.find(f => f.meaning.startsWith('Общее среднее')).value, '50%');
  assert.ok(!facts.some(f => f.meaning.startsWith('Совокупная доля')));
});

test('time narrative includes the last source period beyond the chart limit', () => {
  const dataset = { name: 'trend.csv', columns: ['Date', 'Revenue'], rows: Array.from({ length: 24 }, (_, i) => ({ Date: `${2024 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, Revenue: i + 1 })) };
  const view = prepareAnalysis(dataset).views.find(v => v.spec.type === 'line');
  assert.equal(view.points.length, 12);
  assert.ok(narrativeFacts(dataset, view).some(f => f.meaning.includes('2025-12') && f.value === '24'));
});
