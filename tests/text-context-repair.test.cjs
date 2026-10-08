const test = require('node:test');
const assert = require('node:assert/strict');
const gc = require('../lib/gigachat.ts');
const source = 'Отчёт проекта «Аврора». Всего 50 задач, на ревью находятся 20 задач.';

test('an empty optional chart subtitle does not reject valid text evidence', () => {
  const { resolveTextAnalysis } = require('../lib/text-analysis.ts');
  const text = 'На ревью 20 задач, в работе 10 задач.';
  const report = resolveTextAnalysis({
    headline: 'Задачи ожидают проверки', narrative: 'На ревью 20 задач. В работе 10 задач.', evidence: [text], insights: [],
    charts: [{type:'bar',title:'Статусы задач',subtitle:'',data:[{name:'Ревью',fact:'s0n0'},{name:'В работе',fact:'s0n1'}]}],
  }, text);
  assert.equal(report.charts[0].subtitle, undefined);
});

test('text validation checks minority claims in the headline as well as the paragraph', () => {
  const { resolveTextAnalysis } = require('../lib/text-analysis.ts');
  const text = 'На ревью находятся 20 из 50 задач, это 40%.';
  const draft = { headline: 'Большинство задач ожидает ревью', narrative: 'На ревью находятся 20 задач. Всего учтено 50 задач.', evidence: [text], charts: [], insights: [] };
  assert.throws(() => resolveTextAnalysis(draft, text), /ни в заголовке/);
  assert.equal(resolveTextAnalysis({ ...draft, headline: 'Часть задач ожидает ревью' }, text).headline, 'Часть задач ожидает ревью');
});

for (const includesName of [true, false]) test(`text narrative requires the source name despite a paraphrased reviewer quote (${includesName})`, async () => {
  const saved = { chat: gc.gcChat, has: gc.hasGigaChat };
  const paragraph = includesName ? 'В проекте «Аврора» на ревью находятся 20 задач. Всего в отчёте 50 задач.' : 'На ревью находятся 20 задач. Всего в отчёте 50 задач.';
  gc.hasGigaChat = () => true;
  gc.gcChat = async messages => {
    const prompt = messages[0].content;
    if (prompt.startsWith('Выбери 2–3 содержательно')) return '{"charts":[]}';
    if (prompt.startsWith('Для любого источника')) return 'Задачи проекта ожидают проверки\n' + paragraph;
    if (prompt.startsWith('Отредактируй')) return paragraph;
    if (prompt.startsWith('Проверь фактическую')) return JSON.stringify({supported:true,contextPresent:true,contextQuote:'Команда проекта Аврора'});
    throw new Error('Unexpected model call');
  };
  try {
    const task = require('../lib/ai.ts').analyze({name:'Отчёт',source:'text',rows:[],columns:[],rawText:source});
    if (includesName) assert.match((await task).narrative, /Аврора/);
    else {
      const result=await task;
      assert.match(result.narrative.split(/(?<=[.!?])\s+/)[0], /Аврора/);
      assert.notEqual(result.narrative, paragraph);
      assert.match(result.narrative, /50 задач/);
    }
  } finally { gc.gcChat = saved.chat; gc.hasGigaChat = saved.has; }
});
