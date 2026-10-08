import type { AnalyticsResult } from './analytics';
import { formatNumber } from './table';
import type { Dataset } from './types';
import { numericColumns } from './table';

const stem=(s:string)=>s.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/(?:ами|ями|ого|его|ому|ему|ыми|ими|иях|ах|ях|ом|ем|ой|ый|ий|ая|яя|ое|ее|ую|юю|ов|ев|ам|ям|ы|и|а|я|у|ю|е|о)$/,'');
const words=(s:string)=>(s.match(/[\p{L}]+/gu)??[]).map(stem).filter(w=>w.length>=3);

export function alignComparison(question:string, raw:any, dataset?:Dataset):any {
  const plan=structuredClone(raw);
  if(!Array.isArray(plan.metrics))return plan;
  const original=plan.metrics;
  const modes=['difference','relative_change','relative_decrease','ratio','percentage_points'];
  const metrics=original.filter((m:any)=>!modes.includes(m?.op));
  const embedded=original.filter((m:any)=>modes.includes(m?.op));
  if(embedded.length) {
    plan.metrics=metrics;
    plan.compare=[...(Array.isArray(plan.compare)?plan.compare:[]),...embedded.map((m:any)=>({name:m.name,mode:m.op,left:metrics.indexOf(original[m.left]),right:metrics.indexOf(original[m.right])}))];
  }
  const comparisons=Array.isArray(plan.compare)?plan.compare:[];
  if (/на сколько процентов/i.test(question) && !/процентн\S*\s+пункт/i.test(question) && comparisons.some((c:any)=>c.mode==='percentage_points')) {
    for(const c of comparisons)if(c.mode==='percentage_points')c.mode='relative_change';
  }
  // A relative comparison of category counts can be expressed as shares by
  // the planner. Recover the requested counts instead of reporting two shares.
  if(dataset && /на сколько процентов/i.test(question) && !/дол[яюи]|выжива|вероятност|процентн\S*\s+пункт/i.test(question)) {
    const numeric=new Set(numericColumns(dataset));
    for(const m of metrics)if(m.op==='share' && (!m.column || dataset.columns.includes(m.column) && !numeric.has(m.column))) {
      m.op='count';delete m.column;
      m.name=String(m.name).replace(/Доля/gi,'Количество').replace(/[,\s]*%/g,'');
    }
  }
  const questionWords=words(question);
  for(const c of comparisons) {
    if(!metrics[c.left]||!metrics[c.right])continue;
    const left=words(String(metrics[c.left].name)), right=words(String(metrics[c.right].name));
    const position=(own:string[],other:string[])=>{
      const positions=own.filter(w=>!other.includes(w)).map(w=>questionWords.indexOf(w)).filter(i=>i>=0);
      return positions.length?Math.min(...positions):null;
    };
    const a=position(left,right),b=position(right,left);
    if(a!==null&&b!==null&&a>b)[c.left,c.right]=[c.right,c.left];
    if(/процент/i.test(question)&&['relative_change','relative_decrease'].includes(c.mode)) {
      if(/меньше|ниже/i.test(question)&&!/больше|выше/i.test(question))c.mode='relative_decrease';
      else if(/больше|выше/i.test(question)&&!/меньше|ниже/i.test(question))c.mode='relative_change';
    }
  }
  return plan;
}

// The prose generator must not invert the denominator or call a negative
// decrease "less". State the direction from the computed operands themselves.
export function renderComparison(plan:any,result:AnalyticsResult):string|null {
  if(plan.groupBy?.length||plan.metrics?.length!==2||plan.compare?.length!==1||result.rows.length!==1)return null;
  const c=plan.compare[0];
  if(!['relative_change','relative_decrease'].includes(c.mode))return null;
  const row=result.rows[0],left=result.columns[c.left],right=result.columns[c.right];
  const a=row[left],b=row[right];
  if(typeof a!=='number'||typeof b!=='number')return null;
  const values=`${left} — ${formatNumber(a)}; ${right} — ${formatNumber(b)}.`;
  if(b===0)return values+' Процентное сравнение не вычисляется: второе значение равно нулю.';
  if(a===b)return values+' Значения равны, разница — 0%.';
  return values+` Первое значение ${a<b?'меньше':'больше'} второго на ${formatNumber(Math.abs((a-b)/b)*100)}%.`;
}
