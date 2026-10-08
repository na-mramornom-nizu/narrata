const {test}=require('node:test');const assert=require('node:assert/strict');
const {resolveTextAnalysis}=require('../lib/text-analysis.ts');
const {requestBody,RequestLimitError}=require('../lib/request-body.ts');
const {parseFile,datasetFromText}=require('../lib/parse.ts');
const {serviceError}=require('../lib/errors.ts');
const source='На ревью 20 задач. Готово 30 задач.';
const analysis={headline:'Завершённых задач больше, чем ожидающих ревью',narrative:'Готово 30 задач. На ревью остаются 20 задач.',evidence:[source],insights:[{label:'Готово',value:'30',evidence:'Готово 30 задач.'}],charts:[{type:'bar',title:'Задачи по статусам',data:[{name:'На ревью',value:20,evidence:'На ревью 20 задач.'},{name:'Готово',value:30,evidence:'Готово 30 задач.'}]}]};
test('text analysis keeps source values and removes model-only fields',()=>{
 const result=resolveTextAnalysis(structuredClone(analysis),source);assert.equal(result.charts[0].data[0].value,20);assert.equal(result.charts[0].data[0].evidence,undefined);
});
test('text analysis rejects invented charts, numbers and ungrounded evidence',()=>{
 for(const mutate of [a=>a.charts[0].data[0].value=99,a=>a.narrative='Готово 99 задач. Ревью ожидают 20 задач.',a=>a.evidence=['Выдуманная цитата'],a=>a.charts[0].data=null]){
 const a=structuredClone(analysis);mutate(a);assert.throws(()=>resolveTextAnalysis(a,source));}
});
test('text without numerical facts does not require fabricated charts',()=>{
 const result=resolveTextAnalysis({headline:'Недостаточно данных для аналитики',narrative:'В тексте содержится только приветствие. Для анализа нужен отчёт с фактами.',evidence:['привет, мир'],charts:[],insights:[]},'привет, мир');assert.equal(result.charts.length,0);
});
test('text charts bind fact references to source categories and reject unsupported prose',()=>{
 const a=structuredClone(analysis);a.charts[0].data=[{name:'На ревью',fact:'s0n0'},{name:'Готово',fact:'s1n0'}];
 assert.deepEqual(resolveTextAnalysis(a,source).charts[0].data,[{name:'На ревью',value:20},{name:'Готово',value:30}]);
 for(const narrative of ['Задачи распределены равномерно. Готово 30 задач.','Готово 30 задач: - завершены. На ревью 20 задач.'])assert.throws(()=>resolveTextAnalysis({...structuredClone(analysis),narrative},source));
});
test('request size counts UTF-8 bytes including chat, not file size',()=>{
 assert.throws(()=>requestBody({text:'Я'.repeat(2_100_000)}),RequestLimitError);
 assert.equal(JSON.parse(requestBody({text:'Я'})).text,'Я');
 assert.throws(()=>datasetFromText('а'.repeat(50_001)),/50 000/);
});
test('plain text renamed to Excel is rejected before parsing',async()=>{
 await assert.rejects(parseFile(new File(['name,value\nA,1'],'broken.xlsx')),/не соответствует формату Excel/);
});
test('AI misconfiguration and timeout are service errors, not missing facts',async()=>{
 const gc=require('../lib/gigachat.ts'),saved=gc.hasGigaChat;gc.hasGigaChat=()=>false;
 try {await assert.rejects(require('../lib/ai.ts').analyze(datasetFromText(source)),/AUTH/);await assert.rejects(require('../lib/ai.ts').chat(datasetFromText(source),[{role:'user',content:'Сколько задач?'}]),/AUTH/);}
 finally{gc.hasGigaChat=saved;}
 assert.equal(serviceError(new Error('GigaChat не ответил за 30 секунд'),'analysis').status,504);
});
