import type { Dataset } from './types';
import { InvalidQuery } from './table-query';
import { metricDescription } from './answer';
import { numericColumns, numericValue } from './table';

const bad=(message:string):never=>{throw new InvalidQuery(message);};
const quote=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
const literal=(v:unknown):string=>v===null?'NULL':typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'?"'"+v.replace(/'/g,"''")+"'":bad('Неверное значение фильтра.');
const object=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:bad('Нужен объект вычисления.');
const array=(v:any,max=30):any[]=>Array.isArray(v)&&v.length<=max?v:bad('Неверный список вычислений.');

// Common analytical semantics (denominators, NULLs, comparison direction) are
// compiled in code. The model selects fields and operations, never formulas.
export function compileCompute(dataset:Dataset,raw:unknown):string {
  const p={...object(raw)}, numeric=new Set(numericColumns(dataset));
  const column=(c:unknown)=>typeof c==='string'&&dataset.columns.includes(c)?c:bad(`Нет колонки ${String(c)}.`);
  const measure=(c:unknown)=>{const n=column(c);if(!numeric.has(n))bad(`Колонка ${n} не числовая.`);if(/(^|[_\s-])(id|code|код|index)$/i.test(n.replace(/([a-z])([A-Z])/g,'$1_$2')))bad('Идентификатор нельзя суммировать как показатель; для количества используй count.');return quote(n);};
  const resolve=(c:string,value:any)=>{
    if(typeof value!=='string'||!value.trim())return value;
    const norm=(v:any)=>String(v??'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е');
    const values=[...new Set(dataset.rows.map(r=>r[c]).filter(v=>v!==null&&v!==undefined))];
    const exact=values.find(v=>norm(v)===norm(value));if(exact!==undefined)return exact;
    const matches=values.filter(v=>(' '+norm(v)+' ').includes(' '+norm(value)+' '));
    if(matches.length===1)return matches[0];
    const related=[...new Set(dataset.rows.filter(row=>dataset.columns.some(key=>norm(row[key])===norm(value))).map(row=>row[c]))];
    if(related.length===1)return related[0];
    if(matches.length>1)bad('Сокращенное название неоднозначно. Выбери точное значение из каталога.');
    return value;
  };
  const filter=(f:any,depth=0):string=>{
    if(depth>6)bad('Слишком сложный фильтр.');
    f=object(f);
    for(const key of ['all','any'])if(f[key]){const parts=array(f[key],15);if(!parts.length)bad('Пустой фильтр.');return '('+parts.map(v=>filter(v,depth+1)).join(key==='all'?' AND ':' OR ')+')';}
    const c=column(f.column),q=quote(c),op=f.op??'eq';
    if(op==='is_null')return q+' IS NULL';if(op==='not_null')return q+' IS NOT NULL';
    if(op==='in'){const values=array(f.value,100);if(!values.length)bad('Пустой список in.');return q+' IN ('+values.map(v=>literal(resolve(c,v))).join(',')+')';}
    if(op==='contains')return 'instr(lower_ru('+q+'),lower_ru('+literal(f.value)+'))>0';
    if(!['eq','ne','gt','gte','lt','lte'].includes(op))bad('Неизвестный фильтр.');
    const v=['eq','ne'].includes(op)?resolve(c,f.value):f.value;
    if(v===null)return q+(op==='ne'?' IS NOT NULL':' IS NULL');
    return q+({eq:'=',ne:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='} as Record<string,string>)[op]+literal(v);
  };
  const filters=(fs:any)=>fs===undefined?'1':Array.isArray(fs)?(fs.length?array(fs,15).map(f=>filter(f)).join(' AND '):'1'):filter(fs);
  const groups=array(p.groupBy??[],6).map(g=>{
    if(typeof g==='string')return {expr:quote(column(g)),name:g};
    g=object(g);const c=quote(column(g.column));if(!['year','month','day'].includes(g.period))bad('Период группировки: year, month или day.');
    return {expr:`strftime('${g.period==='year'?'%Y':g.period==='month'?'%Y-%m':'%Y-%m-%d'}',iso_date(${c}))`,name:typeof g.name==='string'?g.name:g.column};
  });
  const original=array(p.metrics,15);
  const modes=['difference','relative_change','relative_decrease','ratio','percentage_points'];
  const specs=original.filter(m=>!modes.includes(m?.op));
  const remap=(i:number)=>{const target=original[i];const index=specs.indexOf(target);return index<0?bad('Сравнение должно ссылаться на исходные метрики.'):index;};
  p.compare=[...array(p.compare??[],10),...original.filter(m=>modes.includes(m?.op)).map(m=>({name:m.name,mode:m.op,left:remap(m.left),right:remap(m.right)}))];
  if(!specs.length)bad('Укажи metrics.');
  const metrics=specs.map((m,index)=>{
    m=object(m);let n=typeof m.name==='string'&&m.name.trim()&&m.name.length<180?m.name:bad('Укажи понятное русское name показателя.');
    if(['rate','share'].includes(m.op)&&!n.includes('%'))n+=', %';
    if(m.column&&['sum','avg','min','max','median','percentile','stddev'].includes(m.op)){const unit=metricDescription(column(m.column)).suffix.trim();if(unit&&!n.includes(unit))n+=' ('+unit+')';}
    const where=filters(m.filters);const field=m.column===undefined?null:quote(column(m.column));
    const conditional=(value:string)=>`CASE WHEN ${where} THEN ${value} END`;
    let expr:string;
    if(m.op==='count')expr=`COUNT(${conditional('1')})`;
    else if(m.op==='count_distinct')expr=`COUNT(DISTINCT ${conditional(field??bad('Нужна column.'))})`;
    else if(m.op==='missing')expr=`COUNT(CASE WHEN (${where}) AND ${field??bad('Нужна column.')} IS NULL THEN 1 END)`;
    else if(m.op==='share') {
      const counts=m.column===undefined||!numeric.has(column(m.column));
      const source=counts?'1':measure(m.column);
      const fn=counts?'COUNT':'SUM';
      const numerator=`${fn}(${conditional(source)})`;
      const denominator=groups.length?`SUM(${fn}(${source})) OVER ()`:`${fn}(${source})`;
      expr=`100.0*${numerator}/NULLIF(${denominator},0)`;
    } else if(m.op==='rate') {
      const c=column(m.column);const values=dataset.rows.map(r=>numericValue(r[c])).filter(v=>v!==null);
      if(!values.length||!values.every(v=>v===0||v===1))bad('rate требует бинарную колонку 0/1. Для долей категорий используй share.');
      expr=`100.0*AVG(${conditional(measure(c))})`;
    } else if(['corr','covariance','weighted_avg'].includes(m.op))expr=`${m.op}(${conditional(measure(m.column))},${conditional(measure(m.y))})`;
    else if(m.op==='percentile'){if(typeof m.p!=='number'||m.p<0||m.p>1)bad('p от 0 до 1.');expr=`percentile(${conditional(measure(m.column))},${m.p})`;}
    else if(['sum','avg','min','max','median','variance','stddev'].includes(m.op))expr=`${m.op}(${conditional(measure(m.column))})`;
    else return bad(`Неизвестный агрегат ${String(m.op)}.`);
    return {expr,name:n,index};
  });
  const names=[...groups.map(g=>g.name),...metrics.map(m=>m.name)];
  if(new Set(names).size!==names.length)bad('Названия результатов должны различаться.');
  const extra:string[]=[];
  for(const comparison of array(p.compare??[],10)) {
    const c=object(comparison);if(!Number.isInteger(c.left)||!Number.isInteger(c.right)||!metrics[c.left]||!metrics[c.right])bad('left/right — индексы metrics с нуля.');
    const a=quote(metrics[c.left].name),b=quote(metrics[c.right].name);
    const expressions:Record<string,string>={difference:`${a}-${b}`,relative_change:`100.0*(${a}-${b})/NULLIF(${b},0)`,relative_decrease:`100.0*(${b}-${a})/NULLIF(${b},0)`,ratio:`1.0*${a}/NULLIF(${b},0)`,percentage_points:`${a}-${b}`};
    if(!expressions[c.mode])bad('Неизвестный способ сравнения.');
    if(typeof c.name!=='string'||!c.name.trim()||names.includes(c.name))bad('Укажи уникальное name сравнения.');
    const comparisonName=['relative_change','relative_decrease'].includes(c.mode)&&!c.name.includes('%')?c.name+', %':c.mode==='percentage_points'&&!/пункт|п\.п\./i.test(c.name)?c.name+' (п.п.)':c.name;
    names.push(comparisonName);extra.push(expressions[c.mode]+' AS '+quote(comparisonName));
  }
  let sql='WITH computed AS (SELECT '+[...groups.map(g=>g.expr+' AS '+quote(g.name)),...metrics.map(m=>m.expr+' AS '+quote(m.name))].join(',')+' FROM data WHERE '+filters(p.filters)+(groups.length?' GROUP BY '+groups.map(g=>g.expr).join(','):'')+') SELECT *'+(extra.length?','+extra.join(','):'')+' FROM computed';
  if(p.orderBy){const order=array(p.orderBy,6).map(o=>{o=object(o);if(!names.includes(o.name)||!['asc','desc'].includes(o.direction))bad('Некорректная сортировка.');return quote(o.name)+' '+o.direction;});sql+=' ORDER BY '+order.join(',');}
  if(p.limit!==undefined){if(!Number.isInteger(p.limit)||p.limit<1||p.limit>100)bad('limit от 1 до 100.');sql+=' LIMIT '+p.limit;}
  return sql;
}

export { COMPUTE_SYSTEM } from './prompts/query-plans';
