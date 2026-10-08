import type { Analysis, ChartSpec } from './types';

const normalized=(text:string)=>text.replace(/\s+/g,' ').trim();
const numbers=(text:string)=>(text.match(/-?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?/g)??[]).map(n=>Number(n.replace(/[ \u00a0\u202f]/g,'').replace(',','.')));
export const textPassages=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).map((text,id)=>({id,text,numbers:numbers(text).map((value,index)=>({id:`s${id}n${index}`,value}))}));

// Text charts have no table executor: require source evidence for every point.
export function resolveTextAnalysis(raw:unknown, source:string):Analysis {
  const fail=(reason:string):never=>{throw new Error(reason);};
  if(!raw||typeof raw!=='object')return fail('Нужен объект анализа');
  const a=raw as any;
  const allowed=new Set(numbers(source));
  const percentages=(text:string)=>(text.match(/\d+(?:[.,]\d+)?\s*%/g)??[]).map(value=>value.replace(/\s/g,'').replace(',','.'));
  const prose=(value:unknown):string=>{
    if(typeof value!=='string'||!value.trim())return fail('Нужен непустой текст');
    if(numbers(value).some(n=>!allowed.has(n)))return fail('Числа должны присутствовать в исходном тексте, не вычисляй их самостоятельно');
    if(percentages(value).some(n=>!percentages(source).includes(n)))return fail('Не превращай количество в процент. Проценты копируй только из исходного текста');
    return value.trim();
  };
  const passages=textPassages(source);
  const quote=(value:unknown):string=>typeof value==='number' && Number.isInteger(value)?passages[value]?.text??'':typeof value==='string'?value:'';
  const evidence=(value:unknown)=>!!quote(value).trim() && normalized(source).includes(normalized(quote(value)));
  const categoryIn=(name:string,text:string)=>{
    const terms=(name.toLowerCase().match(/[\p{L}]{4,}/gu)??[]).map(word=>word.replace(/(?:ены|ено|ами|ого|ому|ами|ах|ом|ой|ые|ий|ая|а|ы|и|е|у)$/,''));
    const words=(text.toLowerCase().match(/[\p{L}]+/gu)??[]);
    return terms.length?terms.every(term=>words.some(word=>word.startsWith(term))):text.toLowerCase().includes(name.toLowerCase());
  };
  const narrative=prose(a.narrative);
  if(/(?:^|\s)[-*•]\s/.test(narrative))return fail('Замени список связным абзацем из двух законченных предложений, без маркеров');
  if(/равномерн/i.test(narrative)&&!/равномерн/i.test(source))return fail('Равномерность не указана в источнике. Удали это утверждение и опиши конкретные значения');
  if(/большинство|более половины|большая часть/i.test(narrative)&&percentages(source).length&&percentages(source).every(p=>Number(p.replace('%',''))<=50))return fail('Доли в источнике не превышают 50%. Не называй их большинством');
  const sentences=narrative.replace(/(млрд|млн|тыс|руб|долл)\.(?=\s+[а-яё])/g,'$1').split(/(?<=[.!?])\s+/);
  if(sentences.length<2||sentences.length>3||!/[.!?]$/.test(narrative))return fail('Нарратив должен содержать 2–3 законченных предложения');
  if(!Array.isArray(a.evidence)||!a.evidence.length||!a.evidence.every(evidence))return fail('Подтверди нарратив точными цитатами из источника в evidence');
  if(!Array.isArray(a.charts)||a.charts.length>3||!Array.isArray(a.insights))return fail('Нужны списки charts и insights, не более трех графиков');
  if(passages.filter(p=>p.numbers.length>=3).length>=2 && a.charts.length<2)return fail('В тексте есть несколько числовых разбивок. Выбери два разных графика по этим разбивкам, не возвращай пустой charts');
  const charts:ChartSpec[]=a.charts.map((c:any)=>{
    if(!c||!['bar','pie','line','area'].includes(c.type)||!Array.isArray(c.data)||c.data.length<2||c.data.length>12)return fail('Для графика нужны допустимый тип и 2–12 точек');
    const data=c.data.map((p:any)=>{
      if(p?.fact) {
        const fragment=passages.find(fragment=>fragment.numbers.some(n=>n.id===p.fact));
        const fact=fragment?.numbers.find(n=>n.id===p.fact);
        if(!fact)return fail('Используй существующий id из numbers');
        p.value=fact.value;p.evidence=fragment!.id;
      }
      if(!p||typeof p.name!=='string'||!p.name.trim()||typeof p.value!=='number'||!Number.isFinite(p.value))return fail('Каждая точка должна содержать название и конечное число');
      if(!evidence(p.evidence)||!numbers(quote(p.evidence)).includes(p.value)||!categoryIn(p.name,quote(p.evidence))) {
        const candidates=passages.filter(fragment=>numbers(fragment.text).includes(p.value)&&categoryIn(p.name,fragment.text));
        if(candidates.length!==1)return fail(`Для точки ${p.name} выбери evidence из фрагментов: ${candidates.map(p=>p.id).join(',')}`);
        p.evidence=candidates[0].id;
      }
      return {name:p.name.trim(),value:p.value};
    });
    if(new Set(data.map((p:{name:string})=>p.name)).size!==data.length)return fail('Названия точек не должны повторяться');
    if(c.type==='pie'&&(data.some((p:{value:number})=>p.value<0)||data.reduce((sum:number,p:{value:number})=>sum+p.value,0)<=0))return fail('Для долей нужны неотрицательные значения и положительная сумма');
    if(['line','area'].includes(c.type)&&!data.every((p:{name:string})=>/^\d{4}-\d{2}(?:-\d{2})?$/.test(p.name)))c.type='bar';
    if(['line','area'].includes(c.type))data.sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
    return {type:c.type,title:prose(c.title),subtitle:typeof c.subtitle==='string'?prose(c.subtitle):undefined,data};
  });
  const insights=a.insights.slice(0,3).map((i:any)=>{
    if(!i||!evidence(i.evidence))return fail('Показатель должен иметь цитату evidence');
    const value=prose(i.value);
    if(numbers(value).some(n=>!numbers(quote(i.evidence)).includes(n)))return fail('Число показателя должно быть в его цитате');
    return {label:prose(i.label),value};
  });
  return {headline:prose(a.headline),narrative,insights,charts};
}
