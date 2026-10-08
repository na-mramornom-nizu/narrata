const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareAnalysis, resolveAnalysis } = require('../lib/analysis-plan.ts');
const { buildChartData } = require('../lib/chart.ts');

test('analysis computes group rates from all rows and excludes identifiers', () => {
  const rows = Array.from({length:60}, (_, i) => ({ PassengerId:i+1, Sex:i<30?'female':'male', Survived:i<24?1:0 }));
  const context = prepareAnalysis({name:'fixture',source:'file',columns:Object.keys(rows[0]),rows});
  assert.ok(context.views.every(v => v.spec.yKey !== 'PassengerId'));
  const rates=context.views.find(v=>v.spec.xKey==='Sex'&&v.spec.yKey==='Survived');
  assert.deepEqual(rates.points,[{name:'female',value:80},{name:'male',value:0}]);
  assert.ok(context.views.every(v=>!v.types.includes('line')));
});

test('pie retains the whole total through the other slice; model values cannot replace it', () => {
  const rows=Array.from({length:20},(_,i)=>({Name:`Group ${i}`,Amount:i+1}));
  const spec={type:'pie',xKey:'Name',yKey:'Amount',aggregation:'sum',limit:6,includeOther:true,data:[{name:'fake',value:999}]};
  const points=buildChartData(rows,spec);
  assert.equal(points.length,6);
  assert.equal(points.at(-1).name,'Остальные');
  assert.equal(points.reduce((sum,p)=>sum+p.value,0),210);
});

test('time series candidates require temporal values', () => {
  const rows=[{Date:'2026-01',Revenue:10},{Date:'2026-02',Revenue:20}];
  const context=prepareAnalysis({name:'sales',source:'file',columns:Object.keys(rows[0]),rows});
  assert.ok(context.views.some(v=>v.types.includes('line')));
});

test('narrative rejects invented numbers, currency and invalid chart choices', () => {
  const rows=[{Name:'A',Amount:10},{Name:'B',Amount:20}];
  const context=prepareAnalysis({name:'sales',source:'file',columns:Object.keys(rows[0]),rows});
  const input={headline:'Вторая группа лидирует',narrative:'Значения отличаются. Лидер выделяется среди групп.',insights:Array.from({length:3},()=>({label:'Записи',fact:'f0'})),charts:context.views.slice(0,2).map(v=>({view:v.id,type:v.types[0],title:'Сравнение групп',subtitle:'Значения из файла'}))};
  assert.ok(resolveAnalysis(input,context).charts.length);
  assert.throws(()=>resolveAnalysis({...input,narrative:'Значение равно 99999.'},context));
  assert.doesNotMatch(resolveAnalysis({...input,narrative:'Выручка составляет 10 долларов. Группы отличаются.'},context).narrative, /доллар/);
  assert.throws(()=>resolveAnalysis({...input,charts:[{...input.charts[0],type:'line'}]},context));
});
