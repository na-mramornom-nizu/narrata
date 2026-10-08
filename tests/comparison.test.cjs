const {test}=require('node:test');
const assert=require('node:assert/strict');
const {alignComparison,renderComparison}=require('../lib/comparison.ts');
const {compileCompute}=require('../lib/compute-query.ts');
const {runSQL}=require('../lib/sql-query.ts');
const question='На сколько процентов аттракционов в Даниловском районе меньше, чем в Хорошёвском?';
const dataset={name:'objects.csv',source:'file',columns:['Район'],rows:Array.from({length:9},(_,i)=>({'Район':i<3?'Даниловский район':'Хорошёвский район'}))};
const plan={kind:'compute',metrics:[{name:'Хорошёвский район',op:'count',filters:[{column:'Район',value:'Хорошевский район'}]},{name:'Даниловский район',op:'count',filters:[{column:'Район',value:'Даниловский район'}]}],compare:[{left:0,right:1,mode:'relative_change',name:'Разница'}]};

test('reversed metric order and ё aliases retain the question denominator',async()=>{
 const aligned=alignComparison(question,plan);
 const result=await runSQL(dataset,compileCompute(dataset,aligned));
 assert.equal(result.rows[0]['Разница, %'],50);
 assert.match(renderComparison(aligned,result),/Даниловский район — 3; Хорошёвский район — 6.*меньше второго на 50%/);
 assert.equal(plan.compare[0].left,0);
});
test('relative percentage cannot silently become percentage points',()=>{
 assert.equal(alignComparison(question,{...plan,compare:[{left:0,right:1,mode:'percentage_points'}]}).compare[0].mode,'relative_decrease');
});
test('category shares become counts for a relative count question',async()=>{
 const input={...plan,metrics:plan.metrics.map(m=>({...m,op:'share',column:'Район'})),compare:[{left:0,right:1,mode:'percentage_points',name:'Разница'}]};
 const aligned=alignComparison(question,input,dataset);
 assert.ok(aligned.metrics.every(m=>m.op==='count'));
 const result=await runSQL(dataset,compileCompute(dataset,aligned));
 assert.match(renderComparison(aligned,result),/— 3;.*— 6.*на 50%/);
 const rates=alignComparison('На сколько процентов доля выживших женщин выше доли выживших мужчин?',{...input,metrics:input.metrics.map(m=>({...m,op:'rate'}))},dataset);
 assert.ok(rates.metrics.every(m=>m.op==='rate'));
});
test('opposite premise, equality and zero denominator are explicit',()=>{
 const p={metrics:[{},{}],compare:[{left:0,right:1,mode:'relative_decrease'}]};
 const result=(a,b)=>({columns:['А','Б'],rows:[{'А':a,'Б':b}],total:1,sourceRows:2});
 assert.match(renderComparison(p,result(6,3)),/больше второго на 100%/);
 assert.match(renderComparison(p,result(3,3)),/Значения равны/);
 assert.match(renderComparison(p,result(3,0)),/второе значение равно нулю/);
});
test('computable group counts survive an incorrect schema hint',async()=>{
 const gc=require('../lib/gigachat.ts'),saved={chat:gc.gcChat,has:gc.hasGigaChat};
 gc.hasGigaChat=()=>true;
 gc.gcChat=async messages=>{
   if(messages[0].content.startsWith('Проверь только'))return '{"missing":true}';
   if(messages[0].content.startsWith('Проверь обоснованность'))return '{"missing":false}';
   return JSON.stringify(plan);
 };
 try{assert.match(await require('../lib/ai.ts').chat(dataset,[{role:'user',content:question}]),/на 50%/);}
 finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});
test('text percentage uses source numbers rather than generated arithmetic',async()=>{
 const gc=require('../lib/gigachat.ts'),saved={chat:gc.gcChat,has:gc.hasGigaChat};
 gc.hasGigaChat=()=>true;
 gc.gcChat=async()=>JSON.stringify({facts:[{name:'Даниловский район',passage:0,number:0},{name:'Хорошёвский район',passage:1,number:0}],answer:'100%'});
 try{assert.match(await require('../lib/ai.ts').chat({name:'Текст',source:'text',rows:[],columns:[],rawText:'Даниловский район: 3 аттракциона. Хорошёвский район: 6 аттракционов.'},[{role:'user',content:question}]),/на 50%/);}
 finally{gc.gcChat=saved.chat;gc.hasGigaChat=saved.has;}
});
