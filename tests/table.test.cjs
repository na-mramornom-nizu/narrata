const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeTable, columnStats, tableContext, numericValue } = require('../lib/table.ts');
const { buildChartData } = require('../lib/chart.ts');
const { executeTableQuery, planTableQuery, validateQuery } = require('../lib/table-query.ts');

const dataset = {
  name: 'fixture.csv', source: 'file', columns: ['Name', 'Amount', 'Code'],
  rows: Array.from({ length: 60 }, (_, index) => ({ Name: `Item ${index + 1}`, Amount: String(index + 1), Code: `C${index + 1}` })),
};
const compact = (text) => text.replace(/\s/g, '');

test('automatic summary skips numeric identifiers', () => {
  const d = { name: 'passengers.csv', source: 'file', columns: ['PassengerId', 'Survived', 'Name'], rows: [{ PassengerId: 1, Survived: 0, Name: 'A' }, { PassengerId: 2, Survived: 1, Name: 'B' }] };
  const analysis = analyzeTable(d);
  assert.equal(analysis.charts[0].yKey, 'Survived');
  assert.equal(analysis.insights[1].value, '1');
});

test('summary and catalog include records beyond the former 40-row cutoff', () => {
  const stats = columnStats(dataset, 'Amount');
  assert.equal(stats.sum, 1830);
  assert.equal(stats.average, 30.5);
  assert.match(tableContext(dataset), /Item 60/);
  const analysis = analyzeTable(dataset);
  assert.equal(compact(analysis.insights[1].value), '1830');
  assert.equal(analysis.insights[2].value, '30,5');
});

test('lookup, ranking and arithmetic execute against the full dataset', () => {
  assert.match(executeTableQuery(dataset, { kind: 'rows', filters: [{ column: 'Name', op: 'eq', value: 'item 60' }], columns: ['Name', 'Amount'], limit: 1 }), /Item 60.*составляет 60/);
  const ranked = executeTableQuery(dataset, { kind: 'rows', filters: [], columns: ['Name', 'Amount'], sort: { column: 'Amount', direction: 'desc' }, limit: 3 });
  assert.match(ranked, /Item 60.*60[\s\S]*Item 59.*59[\s\S]*Item 58.*58/);
  const aggregate = executeTableQuery(dataset, { kind: 'aggregate', filters: [], metrics: [{ op: 'sum', column: 'Amount' }, { op: 'avg', column: 'Amount' }] });
  assert.match(compact(aggregate), /1830/);
  assert.match(aggregate, /30,5/);
  assert.match(executeTableQuery(dataset, { kind: 'difference', column: 'Amount', left: [{ column: 'Name', op: 'eq', value: 'Item 60' }], right: [{ column: 'Name', op: 'eq', value: 'Item 1' }] }), /59\.$/);
});

test('filters do not mix numeric and lexical comparisons', () => {
  const result = executeTableQuery(dataset, { kind: 'aggregate', filters: [{ column: 'Amount', op: 'gt', value: 55 }], metrics: [{ op: 'count' }, { op: 'sum', column: 'Amount' }] });
  assert.match(result, /5 записей/);
  assert.match(result, /290/);
});

test('invalid or invented columns and executable query text are rejected', () => {
  assert.throws(() => validateQuery({ kind: 'aggregate', filters: [], metrics: [{ op: 'sum', column: 'Population' }] }, dataset));
  assert.throws(() => validateQuery({ kind: 'eval', code: 'process.exit()' }, dataset));
  assert.throws(() => validateQuery({ kind: 'rows', filters: [], columns: ['Name'], limit: -1 }, dataset));
});

test('ambiguous comparisons do not silently select a row', () => {
  assert.match(executeTableQuery(dataset, { kind: 'difference', column: 'Amount', left: [{ column: 'Amount', op: 'gt', value: 55 }], right: [{ column: 'Name', op: 'eq', value: 'Item 1' }] }), /Уточните/);
});

test('CSV chart numbers override any model-provided data', () => {
  const spec = { type: 'bar', xKey: 'Name', yKey: 'Amount', aggregation: 'sum', limit: 3, data: [{ name: 'Invented', value: 99999 }] };
  assert.deepEqual(buildChartData(dataset.rows, spec), [{ name: 'Item 60', value: 60 }, { name: 'Item 59', value: 59 }, { name: 'Item 58', value: 58 }]);
  assert.deepEqual(buildChartData(dataset.rows, { ...spec, order: 'asc', limit: 1 }), [{ name: 'Item 1', value: 1 }]);
  assert.deepEqual(buildChartData([], spec), spec.data);
});

test('missing numeric cells are excluded and real zero is retained', () => {
  const d = { ...dataset, rows: [{ Name: 'A', Amount: null }, { Name: 'A', Amount: '' }, { Name: 'A', Amount: '0' }, { Name: 'A', Amount: '12.5' }] };
  assert.equal(columnStats(d, 'Amount').average, 6.25);
  assert.deepEqual(buildChartData(d.rows, { type: 'bar', xKey: 'Name', yKey: 'Amount', aggregation: 'avg' }), [{ name: 'A', value: 6.25 }]);
  assert.equal(numericValue(''), null);
  assert.equal(numericValue('not a number'), null);
  assert.equal(numericValue('12,5'), 12.5);
});

test('chat passes the conversation to the planner and executes its result locally', async () => {
  const gc = require('../lib/gigachat.ts');
  const saved = { chat: gc.gcChat, configured: gc.hasGigaChat };
  const history = [{ role: 'user', content: 'Покажи Item 1' }, { role: 'assistant', content: 'Name: Item 1; Amount: 1' }, { role: 'user', content: 'А Item 60?' }];
  gc.hasGigaChat = () => true;
  gc.gcChat = async (messages) => {
    if (messages[0].content.startsWith('Ты редактор')) return '{}';
    if (messages[0].content.startsWith('Проверь только')) return '{"missing":false}';
    if (messages[0].content.startsWith('Переформулируй')) {
      assert.deepEqual(messages.slice(1), history);
      return 'Покажи Name и Amount для Item 60';
    }
    assert.equal(messages[1].content, 'Покажи Name и Amount для Item 60');
    return JSON.stringify({ kind: 'lookup', subjectColumn: 'Name', subjects: ['Item 60'], fields: ['Name', 'Amount'] });
  };
  try {
    const { chat } = require('../lib/ai.ts');
    assert.match(await chat(dataset, history), /Item 60.*составляет 60/);
  } finally {
    gc.gcChat = saved.chat;
    gc.hasGigaChat = saved.configured;
  }
});

test('a unique source code resolves to its name without guessed values', () => {
  const query = planTableQuery({ kind: 'lookup', subjectColumn: 'Name', subjects: ['C60'], fields: ['Amount'] }, dataset);
  assert.match(executeTableQuery(dataset, query), /Item 60.*составляет 60/);
  assert.throws(() => planTableQuery({ kind: 'lookup', subjectColumn: 'Name', subjects: ['Imaginary'], fields: ['Amount'] }, dataset));
});

test('aggregate planner preserves filters and uses the requested operation', () => {
  const query = planTableQuery({ kind: 'aggregate', metric: 'Amount', operations: ['count', 'avg'], filterColumn: 'Amount', filterOperator: 'gt', filterValue: 55 }, dataset);
  assert.match(executeTableQuery(dataset, query), /5 записей[\s\S]*58/);
});

test('an invalid model plan is repaired once and never executed unchecked', async () => {
  const gc = require('../lib/gigachat.ts');
  const saved = { chat: gc.gcChat, configured: gc.hasGigaChat };
  let calls = 0;
  gc.hasGigaChat = () => true;
  gc.gcChat = async (messages) => {
    if (messages[0].content.startsWith('Ты редактор')) return '{}';
    if (messages[0].content.startsWith('Проверь только')) return '{"missing":false}';
    calls++;
    return calls === 1 ? '{"kind":"rank","metric":"Invented"}' : '{"kind":"rank","metric":"Amount","limit":1}';
  };
  try {
    const { chat } = require('../lib/ai.ts');
    assert.match(await chat(dataset, [{ role: 'user', content: 'Maximum amount' }]), /Item 60/);
    assert.equal(calls, 2);
  } finally {
    gc.gcChat = saved.chat;
    gc.hasGigaChat = saved.configured;
  }
});
