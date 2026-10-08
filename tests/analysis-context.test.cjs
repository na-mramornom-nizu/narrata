const test = require('node:test');
const assert = require('node:assert/strict');
const gc = require('../lib/gigachat.ts');
const { prepareAnalysis } = require('../lib/analysis-plan.ts');

for (const verbose of [false, true]) test(`analysis refines prose and accepts paraphrased context (verbose title: ${verbose})`, async () => {
  const saved = { chat: gc.gcChat, has: gc.hasGigaChat };
  const dataset = {name:'countries.csv',source:'file',columns:['Country','GDP'],rows:[{Country:'A',GDP:20},{Country:'B',GDP:10}]};
  const context = prepareAnalysis(dataset);
  let edits = 0;
  gc.hasGigaChat = () => true;
  gc.gcChat = async messages => {
    const prompt = messages[0].content;
    if (prompt.startsWith('Назови контекст')) return 'Страны мира по ВВП';
    if (prompt.startsWith('Выбери 2–3 разных')) return JSON.stringify({charts:context.views.slice(0,2).map(v=>({view:v.id,type:v.types[0],title:'Сравнение ВВП'}))});
    if (prompt.startsWith('Сформулируй короткий')) return 'Страна A лидирует по ВВП';
    if (prompt.startsWith('Для любого источника')) return (verbose ? 'Страна A лидирует с показателем 20, а страна B со значением 10 занимает второе место. Страны мира по ВВП.' : 'Страна A лидирует по ВВП') + '\nСреди стран мира по ВВП лидирует A со значением 20. У страны B значение составляет 10.';
    if (prompt.startsWith('Отредактируй')) { edits++; return 'Среди стран мира по ВВП лидирует A со значением 20. У страны B значение составляет 10.'; }
    if (prompt.startsWith('Проверь фактическую')) return JSON.stringify({supported:true,contextPresent:true,contextQuote:'Лидер по валовому внутреннему продукту'});
    if (prompt.startsWith('Ты переводчик')) return '{}';
    throw new Error('Unexpected model call');
  };
  try {
    const result = await require('../lib/ai.ts').analyze(dataset);
    assert.match(result.narrative, /стран мира по ВВП/);
    assert.equal(edits, 1);
    assert.equal(result.headline, 'Страна A лидирует по ВВП');
    assert.ok(result.charts.length >= 1);
  } finally { gc.gcChat = saved.chat; gc.hasGigaChat = saved.has; }
});
