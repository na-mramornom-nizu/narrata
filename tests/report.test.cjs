const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareTableAnswer, executeTableQuery } = require('../lib/table-query.ts');
const { renderAnswer, NO_INFORMATION } = require('../lib/answer.ts');
const { buildReportDocument, reportFilename, reportChartSvg } = require('../lib/report-document.ts');
const dataset = { name: 'sales.csv', source: 'file', columns: ['Region', 'Revenue (USD)'], rows: [{ Region: 'North', 'Revenue (USD)': 120 }, { Region: 'South', 'Revenue (USD)': 80 }] };
const difference = { kind: 'difference', column: 'Revenue (USD)', left: [{ column: 'Region', op: 'eq', value: 'North' }], right: [{ column: 'Region', op: 'eq', value: 'South' }] };

test('natural phrasing preserves computed numbers, direction and explicit units across domains', () => {
  const draft = prepareTableAnswer(dataset, difference);
  assert.equal(renderAnswer(draft, { label0: 'Выручка региона Север', label1: 'выручки региона Юг' }), 'Выручка региона Север больше выручки региона Юг на 40 долл. США.');
  assert.match(renderAnswer(draft, { label0: 'Выручка 99999' }), /на 40 долл\. США\.$/);
  assert.doesNotMatch(renderAnswer(draft, { label0: 'Выручка 99999' }), /99999/);
  assert.match(executeTableQuery(dataset, { ...difference, left: difference.right, right: difference.left }), /меньше .* на 40/);
  assert.match(executeTableQuery(dataset, { ...difference, right: difference.left }), /совпадают и составляют 120/);
});

test('absent table information always uses the exact requested sentence', () => {
  assert.equal(executeTableQuery(dataset, { kind: 'unsupported' }), NO_INFORMATION);
  assert.equal(executeTableQuery(dataset, { kind: 'rows', filters: [{ column: 'Region', op: 'eq', value: 'Missing' }], columns: dataset.columns, limit: 1 }), NO_INFORMATION);
  const missing = { ...dataset, rows: [{ Region: 'North', 'Revenue (USD)': null }] };
  assert.equal(executeTableQuery(missing, { kind: 'rows', filters: [], columns: dataset.columns, limit: 1 }), NO_INFORMATION);
});

test('text answers require source evidence and use the exact missing-information sentence', async () => {
  const gc = require('../lib/gigachat.ts');
  const saved = { chat: gc.gcChat, configured: gc.hasGigaChat };
  gc.hasGigaChat = () => true;
  const textDataset = { source: 'text', name: 'Отчет', rows: [], columns: [], rawText: 'Выручка проекта Орион составила 120 рублей.' };
  const messages = [{ role: 'user', content: 'Какова выручка?' }];
  try {
    const { chat } = require('../lib/ai.ts');
    gc.gcChat = async () => JSON.stringify({ found: true, answer: textDataset.rawText, evidence: [textDataset.rawText] });
    assert.equal(await chat(textDataset, messages), textDataset.rawText);
    for (const result of [{ found: false }, { found: true, answer: 'Придуманный ответ', evidence: ['Нет такой цитаты'] }]) {
      gc.gcChat = async () => JSON.stringify(result);
      assert.equal(await chat(textDataset, messages), NO_INFORMATION);
    }
  } finally { gc.gcChat = saved.chat; gc.hasGigaChat = saved.configured; }
});

test('PDF includes the entire conversation and chart data rather than only the visible viewport', () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Сообщение ${i + 1}` }));
  const chart = { type: 'bar', title: 'Выручка', xKey: 'Region', yKey: 'Revenue (USD)', aggregation: 'sum' };
  const snapshot = { dataset, analysis: { headline: 'Обзор', narrative: 'Полный текст выводов', insights: [], charts: [chart] }, messages, createdAt: new Date(2026, 9, 8) };
  const document = buildReportDocument(snapshot);
  const serialized = JSON.stringify(document);
  for (const m of messages) assert.ok(serialized.includes(m.content));
  assert.ok(serialized.includes('Полный текст выводов'));
  assert.ok(serialized.includes('120'));
  assert.equal(reportFilename(snapshot), 'Narrata_Отчет_sales_2026-10-08.pdf');
  for (const type of ['bar', 'line', 'area', 'pie']) {
    const svg = reportChartSvg({ ...chart, type }, [{ name: 'A < B & C', value: 12 }, { name: 'D', value: 5 }]);
    assert.match(svg, /^<svg/);
    assert.doesNotMatch(svg, /NaN|Infinity|A < B/);
  }
});
