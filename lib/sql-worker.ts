// Runs only in an isolated Node worker. The string keeps worker imports out of
// the Next.js client bundle; SQL data never becomes JavaScript source.
export const SQL_WORKER = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const numeric = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const s=value.trim().replace(/[\s\u00a0]/g,'').replace(',','.');
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
};
const quote = s => '"'+s.replace(/"/g,'""')+'"';
const date = value => {
  const s=String(value??'');
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)??s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)?.map((v,i,a)=>i===1?a[3]:i===3?a[1]:v);
  if(!m)return null;
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d.toISOString().slice(0,10):null;
};
(async()=>{
  const SQL=await require(workerData.engine)();const db=new SQL.Database();
  try {
    const {dataset,sql}=workerData;
    db.create_function('to_number',numeric);
    db.create_function('iso_date',date);
    db.create_function('lower_ru',x=>x===null?null:String(x).toLocaleLowerCase('ru'));
    db.create_function('sqrt',x=>x===null||x<0?null:Math.sqrt(x));
    db.create_function('power',(x,y)=>x===null||y===null||!Number.isFinite(x**y)?null:x**y);
    for(const op of ['median','percentile','variance','stddev']) db.create_aggregate(op,{
      init:()=>({values:[],p:0.5}),
      step:op==='percentile'?(s,x,p)=>{const n=numeric(x);if(n!==null)s.values.push(n);if(p===null||p<0||p>1)throw Error('Percentile p must be between 0 and 1');s.p=p;return s;}:(s,x)=>{const n=numeric(x);if(n!==null)s.values.push(n);return s;},
      finalize:s=>{const a=s.values;if(!a.length)return null;if(op==='variance'||op==='stddev'){const mean=a.reduce((x,y)=>x+y,0)/a.length;const v=a.reduce((t,x)=>t+(x-mean)**2,0)/a.length;return op==='stddev'?Math.sqrt(v):v;}a.sort((x,y)=>x-y);const p=(a.length-1)*s.p;return a[Math.floor(p)]+(a[Math.ceil(p)]-a[Math.floor(p)])*(p-Math.floor(p));}
    });
    for(const op of ['corr','covariance','weighted_avg']) db.create_aggregate(op,{
      init:()=>[],step:(s,x,y)=>{x=numeric(x);y=numeric(y);if(x!==null&&y!==null)s.push([x,y]);return s;},
      finalize:s=>{if(!s.length)return null;if(op==='weighted_avg'){const w=s.reduce((t,p)=>t+p[1],0);return w===0?null:s.reduce((t,p)=>t+p[0]*p[1],0)/w;}const x=s.reduce((t,p)=>t+p[0],0)/s.length,y=s.reduce((t,p)=>t+p[1],0)/s.length;const c=s.reduce((t,p)=>t+(p[0]-x)*(p[1]-y),0);if(op==='covariance')return c/s.length;const d=Math.sqrt(s.reduce((t,p)=>t+(p[0]-x)**2,0)*s.reduce((t,p)=>t+(p[1]-y)**2,0));return d===0?null:c/d;}
    });
    const numericCols=new Set(workerData.numericColumns);
    db.run('CREATE TABLE data ('+dataset.columns.map(c=>quote(c)+(numericCols.has(c)?' REAL':' TEXT')).join(',')+')');
    db.run('BEGIN');
    const insert=db.prepare('INSERT INTO data VALUES ('+dataset.columns.map(()=>'?').join(',')+')');
    for(const row of dataset.rows)insert.run(dataset.columns.map(c=>row[c]===null||row[c]===undefined||String(row[c]).trim()===''?null:numericCols.has(c)?numeric(row[c]):String(row[c])));
    insert.free();db.run('COMMIT');db.run('PRAGMA query_only=ON');
    const statement=db.prepare('SELECT * FROM ('+sql+') LIMIT 101');
    const columns=statement.getColumnNames();const rows=[];
    if(columns.length>30)throw Error('Select at most 30 result columns');
    while(statement.step()) {
      const values=statement.get();
      if(values.some(x=>typeof x==='string'&&x.length>20000))throw Error('Result text is too long; select a shorter excerpt');
      rows.push(Object.fromEntries(columns.map((c,i)=>[c,typeof values[i]==='number'&&!Number.isFinite(values[i])?null:values[i]])));
    }
    statement.free();parentPort.postMessage({result:{columns,rows:rows.slice(0,100),total:rows.length,sourceRows:dataset.rows.length,truncated:rows.length>100}});
  } finally {db.close();}
})().catch(error=>parentPort.postMessage({error:String(error.message??error)}));
`;
