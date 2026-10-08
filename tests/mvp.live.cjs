// Uses real AI calls. Run against an already started local server.
const fs=require('node:fs');const {parseFile,datasetFromText}=require('../lib/parse.ts');
const base=process.argv[2]||'http://localhost:3001';
const text='Недельный отчёт команды разработки. Из 50 задач 20 находятся на ревью, 10 в работе и 20 завершены. На ревью приходится 40% задач. В понедельник завершили 4 задачи, во вторник 6, в среду 10. Срок релиза в отчёте не указан.';
async function request(path,body){const start=Date.now();const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)});return {status:r.status,ms:Date.now()-start,body:await r.json()};}
(async()=>{
 const sources=[datasetFromText(text),datasetFromText('привет, мир')];
 for(const file of ['D:/countries.csv','D:/titanic.csv'])sources.push(await parseFile(new File([fs.readFileSync(file)],file.split('/').at(-1))));
 let failed=0;
 for(const dataset of sources){const r=await request('/api/analyze',dataset);const a=r.body;const passed=r.status===200&&typeof a.headline==='string'&&typeof a.narrative==='string'&&Array.isArray(a.charts)&&(dataset.rawText==='привет, мир'?a.charts.length===0:a.charts.length>=2&&a.charts.length<=3);if(!passed)failed++;console.log(JSON.stringify({source:dataset.name,input:dataset.rawText?.slice(0,30),passed,ms:r.ms,analysis:a}));}
 const bad=await request('/api/analyze',{rows:[],columns:[],source:'file',name:'empty.csv'});if(bad.status!==400||typeof bad.body.error!=='string')failed++;
 const missing=await request('/api/chat',{dataset:sources[0],messages:[{role:'user',content:'Какой бюджет проекта?'}]});if(missing.body.answer!=='В этом отчете нет такой информации')failed++;
 console.log(JSON.stringify({invalidInput:bad,missing,failed}));process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
