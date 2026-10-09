const test=require('node:test');
const assert=require('node:assert/strict');
const gc=require('../lib/gigachat.ts');
const {textPassages,resolveTextAnalysis,resolveTextCharts,sourceTextNarrative}=require('../lib/text-analysis.ts');
const source='Недельный отчёт команды разработки проекта «Аврора».\nНа конец недели команда ведёт 50 задач. Из них 20 находятся на ревью, 10 — в работе, 20 — завершены. На ревью приходится 40% всех задач, в работе находятся 20%, завершены 40%.\nЗа неделю команда завершила 20 задач: в понедельник — 4, во вторник — 6, в среду — 10.';
const charts=[
  {type:'pie',title:'Статусы задач',data:[{name:'на ревью',fact:'s3n0'},{name:'в работе',fact:'s3n1'},{name:'завершены',fact:'s3n2'}]},
  {type:'bar',title:'Завершение по дням',data:[{name:'понедельник',fact:'s4n1'},{name:'вторник',fact:'s4n2'},{name:'среда',fact:'s4n3'}]},
];
const dataset={name:'Текст',source:'text',rows:[],columns:[],rawText:source};
const paragraph='В проекте «Аврора» на ревью приходится 40% задач, столько же завершено. В среду завершили 10 задач.';

test('source facts distinguish percentages from counts and reject mixed chart units',()=>{
  const passages=textPassages(source);
  assert.equal(passages[2].numbers[0].unit,'number');
  assert.equal(passages[3].numbers[0].unit,'percent');
  const mixed=structuredClone(charts);
  mixed[0].data[1].fact='s2n1';
  assert.throws(()=>resolveTextCharts(mixed,source),/Не смешивай/);
  assert.equal(resolveTextCharts(structuredClone(charts),source)[0].valueSuffix,'%');
});

test('source extract keeps context, original facts and an independent daily breakdown',()=>{
  const draft=sourceTextNarrative(source,resolveTextCharts(structuredClone(charts),source));
  assert.equal(draft.headline,'Доли «на ревью» и «завершены» равны');
  assert.match(draft.narrative,/^В проекте «Аврора» на ревью приходится 40%/);
  assert.match(draft.narrative,/в понедельник — 4, во вторник — 6, в среду — 10/);
  assert.doesNotMatch(draft.narrative,/Из них|большинство|равномерн/);
  assert.equal(draft.narrative.split(/(?<=[.!?])\s+/).length,2);
});

for(const fails of [false,true])test(`text retains checked charts across wording repairs (fail=${fails})`,async()=>{
  const saved={chat:gc.gcChat,has:gc.hasGigaChat};
  let chartCalls=0,editorialCalls=0,reviewCalls=0;
  gc.hasGigaChat=()=>true;
  gc.gcChat=async messages=>{
    const prompt=messages[0].content;
    if(prompt.startsWith('Выбери 2–3 содержательно')){chartCalls++;return JSON.stringify({charts:structuredClone(charts)});}
    if(prompt.startsWith('Вырази проверенный'))return 'На ревью столько же задач, сколько завершено';
    if(prompt.startsWith('Для любого источника')){
      editorialCalls++;
      if(fails){
        if(editorialCalls>1)assert.equal(messages.at(-2).role,'assistant');
        return 'Большинство задач завершено\nВ проекте «Аврора» большинство задач завершено, это 40%. В среду завершили 10 задач.';
      }
      return 'Доли задач на ревью и завершённых равны\n'+paragraph;
    }
    if(prompt.startsWith('Проверь фактическую')){reviewCalls++;return JSON.stringify({supported:true,contextPresent:true,contextQuote:'Аврора'});}
    throw new Error('Unnecessary model call: '+prompt.slice(0,30));
  };
  try{
    const report=await require('../lib/ai.ts').analyze(dataset);
    assert.equal(chartCalls,1);
    assert.equal(editorialCalls,fails?3:1);
    assert.equal(reviewCalls,fails?0:1);
    assert.equal(report.charts.length,2);
    assert.match(report.narrative,/Аврора/);
    assert.doesNotMatch(report.narrative,/большинство/);
    assert.equal(report.headline,'На ревью столько же задач, сколько завершено');
    if(!fails)assert.equal(report.narrative,paragraph);
  }finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});

test('vague group headlines are rejected and source fallback names categories across domains',()=>{
  const draft={headline:'Самые крупные группы имеют равные доли',narrative:paragraph,charts:structuredClone(charts),evidence:[source],insights:[]};
  for(const headline of ['Самые крупные группы имеют равные доли','Все группы представлены в равных долях','Распределение задач по категориям'])assert.throws(()=>resolveTextAnalysis({...draft,headline},source),/Заголовок слишком общий/);
  const survey='Отчёт опроса «Транспорт». Автобус выбирают 40%, метро — 40%, трамвай — 20%.';
  const selected=[{type:'pie',title:'Выбор транспорта',valueSuffix:'%',data:[{name:'Автобус',value:40},{name:'Метро',value:40},{name:'Трамвай',value:20}]}];
  assert.equal(sourceTextNarrative(survey,selected).headline,'Доли «Автобус» и «Метро» равны');
});

test('natural named headlines use the source categories in another domain',async()=>{
  const saved={chat:gc.gcChat,has:gc.hasGigaChat};
  const text='Отчёт опроса «Транспорт». Автобус выбирают 40%, метро — 40%, трамвай — 20%.';
  gc.hasGigaChat=()=>true;
  gc.gcChat=async messages=>{
    const prompt=messages[0].content;
    if(prompt.startsWith('Выбери 2–3 содержательно'))return JSON.stringify({charts:[{type:'pie',title:'Выбор транспорта',data:[{name:'Автобус',fact:'s1n0'},{name:'Метро',fact:'s1n1'},{name:'Трамвай',fact:'s1n2'}]}]});
    if(prompt.startsWith('Вырази проверенный')){
      const fact=JSON.parse(messages[1].content);
      assert.equal(fact.left,'Автобус');assert.equal(fact.right,'Метро');
      return 'Автобус и метро выбирают одинаково часто';
    }
    if(prompt.startsWith('Для любого источника'))return 'Все группы имеют равные доли\nВ опросе «Транспорт» автобус и метро выбирают по 40% участников. Трамвай выбирают 20%.';
    if(prompt.startsWith('Проверь фактическую'))return JSON.stringify({supported:true,contextPresent:true,contextQuote:'Транспорт'});
    throw new Error('Unexpected model call');
  };
  try{
    const report=await require('../lib/ai.ts').analyze({name:'Текст',source:'text',rows:[],columns:[],rawText:text});
    assert.equal(report.headline,'Автобус и метро выбирают одинаково часто');
    assert.doesNotMatch(report.headline,/групп|категори/);
  }finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});

test('a model outage after chart selection returns a checked source extract',async()=>{
  const saved={chat:gc.gcChat,has:gc.hasGigaChat};let calls=0;
  gc.hasGigaChat=()=>true;
  gc.gcChat=async messages=>{
    calls++;
    if(messages[0].content.startsWith('Выбери 2–3 содержательно'))return JSON.stringify({charts:structuredClone(charts)});
    throw new Error('GigaChat HTTP 503');
  };
  try{
    const report=await require('../lib/ai.ts').analyze(dataset);
    assert.equal(calls,3);
    assert.equal(report.charts.length,2);
    assert.match(report.narrative,/В проекте «Аврора» на ревью приходится 40%/);
  }finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});

test('a slow chart request leaves no extra model calls before the source extract',async()=>{
  const saved={chat:gc.gcChat,has:gc.hasGigaChat,now:Date.now};let calls=0,elapsed=0;
  Date.now=()=>saved.now()+elapsed;
  gc.hasGigaChat=()=>true;
  gc.gcChat=async()=>{calls++;elapsed=20_000;return JSON.stringify({charts:structuredClone(charts)});};
  try{
    const report=await require('../lib/ai.ts').analyze(dataset);
    assert.equal(calls,1);
    assert.equal(report.charts.length,2);
    assert.match(report.narrative,/В проекте «Аврора»/);
  }finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;Date.now=saved.now;}
});

test('text superlatives name the actual unique leader and reject tied or invented leaders',()=>{
  const counts=structuredClone(charts);
  counts[0]={type:'bar',title:'Статусы задач',data:[{name:'на ревью',fact:'s2n0'},{name:'в работе',fact:'s2n1'},{name:'завершены',fact:'s2n2'}]};
  const draft={headline:'Больше всего задач завершили в среду',narrative:paragraph,charts:counts,evidence:[source],insights:[]};
  assert.equal(resolveTextAnalysis(draft,source).headline,draft.headline);
  for(const headline of ['Команда «Аврора» завершила больше всего задач','Команда «Аврора» лидирует по завершённым задачам','На ревью находится больше всего задач']) {
    assert.throws(()=>resolveTextAnalysis({...draft,headline},source),/Сравнение в заголовке не подтверждено/);
  }
});

test('a shortening model cannot turn a single team into a winner even if its reviewer approves',async()=>{
  const saved={chat:gc.gcChat,has:gc.hasGigaChat};let editorials=0,chartCalls=0;
  const counts=structuredClone(charts);
  counts[0]={type:'bar',title:'Статусы задач',data:[{name:'на ревью',fact:'s2n0'},{name:'в работе',fact:'s2n1'},{name:'завершены',fact:'s2n2'}]};
  gc.hasGigaChat=()=>true;
  gc.gcChat=async messages=>{
    const prompt=messages[0].content;
    if(prompt.startsWith('Выбери 2–3 содержательно')){chartCalls++;return JSON.stringify({charts:structuredClone(counts)});}
    if(prompt.startsWith('Для любого источника'))return (++editorials===1?'Команда «Аврора» завершила 20 задач за неделю':'Больше всего задач завершили в среду')+'\n'+paragraph;
    if(prompt.startsWith('Сформулируй короткий'))return 'Команда «Аврора» завершила больше всего задач';
    if(prompt.startsWith('Проверь фактическую'))return JSON.stringify({supported:true,contextPresent:true,contextQuote:'Аврора'});
    throw new Error('Unexpected model call');
  };
  try{
    const report=await require('../lib/ai.ts').analyze(dataset);
    assert.equal(report.headline,'Больше всего задач завершили в среду');
    assert.equal(editorials,2);
    assert.equal(chartCalls,1);
  }finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});
