import type { Analysis, ChartSpec } from './types';
import { hasContextQuote, includeTextContext, textContextSubject } from './narrative-context';

const normalized=(text:string)=>text.replace(/\s+/g,' ').trim();
const numbers=(text:string)=>(text.match(/-?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?/g)??[]).map(n=>Number(n.replace(/[ \u00a0\u202f]/g,'').replace(',','.')));
export const textPassages=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean).map((text,id)=>({id,text,numbers:[...text.matchAll(/-?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?/g)].map((match,index)=>({id:`s${id}n${index}`,value:numbers(match[0])[0],unit:/^\s*%/.test(text.slice(match.index!+match[0].length))?'percent':'number'}))}));

function sourceEvidence(source: string) {
  const fail=(reason:string):never=>{throw new Error(reason);};
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
  return { fail, percentages, prose, passages, quote, evidence };
}

// Keep the calculated finding separate from its wording.
export function textDistributionFinding(charts: ChartSpec[]) {
  const distribution=charts.find(c=>c.type==='pie'&&c.valueSuffix==='%'&&c.data&&Math.abs(c.data.reduce((sum,p)=>sum+p.value,0)-100)<0.001);
  if(!distribution?.data?.length)return;
  const maximum=Math.max(...distribution.data.map(p=>p.value));
  return {metric:distribution.title,leaders:distribution.data.filter(p=>p.value===maximum),allEqual:distribution.data.every(p=>p.value===maximum)};
}

function categoryName(name:string):string {
  return name.replace(/^наход(?:ится|ятся)\s+/iu,'').trim();
}

export function mentionsTextCategory(text:string,name:string):boolean {
  const words=(value:string)=>value.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').match(/[\p{L}\p{N}]+/gu)??[];
  const stem=(word:string)=>word.replace(/(?:енных|енные|енным|енного|ены|ено|ами|ого|ому|ах|ом|ой|ые|ый|ий|ая|а|ы|и|е|у)$/u,'');
  const tokens=words(categoryName(name));
  if(!tokens.length)return false;
  const terms=tokens.filter(word=>word.length>=4||/^\d+$/.test(word));
  const actual=words(text).map(stem);
  return (terms.length?terms:tokens).every(term=>actual.includes(stem(term)));
}

// A source extract still names its actual categories instead of vague "groups".
export function textDistributionHeadline(charts: ChartSpec[]): string | undefined {
  const finding=textDistributionFinding(charts);
  if(!finding)return;
  const names=finding.leaders.slice(0,2).map(p=>`«${categoryName(p.name)}»`);
  return names.length===2?`Доли ${names[0]} и ${names[1]} равны`:`${names[0]} занимает наибольшую долю`;
}

// If wording repairs fail, use actual source sentences rather than inventing
// another interpretation. This is a concise extract, with the context retained.
export function sourceTextNarrative(source: string, charts: ChartSpec[] = []) {
  const passages=textPassages(source);
  const lead=passages[0];
  if(!lead)throw new Error('В тексте нет сведений для анализа');
  const independent=passages.slice(1).filter(p=>!/^(?:из них|они|их|это|остальные|из этих)(?=\s|[,.:;]|$)/iu.test(p.text.trim()));
  const selected=independent.filter(p=>p.numbers.length>=3).slice(0,2);
  for(const passage of independent) {
    if(selected.length===2)break;
    if(!selected.includes(passage))selected.push(passage);
  }
  selected.sort((a,b)=>a.id-b.id);
  const contextual=textContextSubject(source)&&selected.length>=2;
  const quoted=contextual?selected:[lead,...selected];
  const sentences=quoted.map(p=>p.text.trim().replace(/[.!?]?$/,'.'));
  if(sentences.length===1)sentences.push('Вывод ограничен сведениями из этого текста.');
  const headline=textDistributionHeadline(charts)??'Главное из отчёта';
  return {headline,narrative:includeTextContext(sentences.join(' '),source),evidence:[lead,...selected].map(p=>p.id),insights:[]};
}

// Text charts have no table executor: require source evidence for every point.
export function resolveTextCharts(raw:unknown, source:string):ChartSpec[] {
  const {fail,prose,passages,quote,evidence}=sourceEvidence(source);
  if(!Array.isArray(raw)||raw.length>3)return fail('Нужен список charts, не более трех графиков');
  if(passages.filter(p=>p.numbers.length>=3).length>=2 && raw.length<2)return fail('В тексте есть несколько числовых разбивок. Выбери два разных графика по этим разбивкам, не возвращай пустой charts');
  const categoryIn=(name:string,text:string)=>{
    const terms=(name.toLowerCase().match(/[\p{L}]{4,}/gu)??[]).map(word=>word.replace(/(?:ены|ено|ами|ого|ому|ами|ах|ом|ой|ые|ий|ая|а|ы|и|е|у)$/,''));
    const words=(text.toLowerCase().match(/[\p{L}]+/gu)??[]);
    return terms.length?terms.every(term=>words.some(word=>word.startsWith(term))):text.toLowerCase().includes(name.toLowerCase());
  };
  return raw.map((c:any)=>{
    if(!c||!['bar','pie','line','area'].includes(c.type)||!Array.isArray(c.data)||c.data.length<2||c.data.length>12)return fail('Для графика нужны допустимый тип и 2–12 точек');
    const units=new Set<string>();
    const data=c.data.map((p:any)=>{
      if(p?.fact) {
        const fragment=passages.find(fragment=>fragment.numbers.some(n=>n.id===p.fact));
        const fact=fragment?.numbers.find(n=>n.id===p.fact);
        if(!fact)return fail('Используй существующий id из numbers');
        units.add(fact.unit);
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
    if(units.size>1)return fail('Не смешивай проценты и количество на одном графике. Выбери все точки из одной разбивки с одинаковыми единицами');
    if(new Set(data.map((p:{name:string})=>p.name)).size!==data.length)return fail('Названия точек не должны повторяться');
    if(c.type==='pie'&&(data.some((p:{value:number})=>p.value<0)||data.reduce((sum:number,p:{value:number})=>sum+p.value,0)<=0))return fail('Для долей нужны неотрицательные значения и положительная сумма');
    if(['line','area'].includes(c.type)&&!data.every((p:{name:string})=>/^\d{4}-\d{2}(?:-\d{2})?$/.test(p.name)))c.type='bar';
    if(['line','area'].includes(c.type))data.sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
    return {type:c.type,title:prose(c.title),subtitle:typeof c.subtitle==='string'&&c.subtitle.trim()?prose(c.subtitle):undefined,data,...(units.has('percent')?{valueSuffix:'%'}:{})};
  });
}

export function resolveTextAnalysis(raw:unknown, source:string):Analysis {
  const {fail,percentages,prose,quote,evidence}=sourceEvidence(source);
  if(!raw||typeof raw!=='object')return fail('Нужен объект анализа');
  const a=raw as any;
  const headline=prose(a.headline);
  const narrative=prose(a.narrative);
  const charts=resolveTextCharts(a.charts,source);
  if((/групп|категори/iu.test(headline)||/^(?:все\s+)?доли\s+(?:равны|совпадают|одинаковы)[.!?]?$/iu.test(headline))&&!charts.some(chart=>chart.data?.some(point=>hasContextQuote(headline,categoryName(point.name))))) {
    return fail('Заголовок слишком общий: назови конкретные объекты, статусы или категории из данных. Не заменяй их словами «группы», «категории» или «распределение»');
  }
  // A superlative must name a compared group, not just the report's subject.
  // This also runs after the model shortens a title: shortening can add a claim.
  const maximum=/больше\s+(?:всего|всех)|наибольш|лид(?:ер|ир)|сам[а-яё]*\s+(?:высок|больш|крупн)/iu;
  const minimum=/меньше\s+(?:всего|всех)|наименьш|сам[а-яё]*\s+(?:низк|мал)/iu;
  if((maximum.test(headline)||minimum.test(headline))&&headline!==textDistributionHeadline(charts)) {
    const quoted=normalized(source).toLocaleLowerCase('ru-RU').includes(normalized(headline.replace(/[.!?]+$/,'')).toLocaleLowerCase('ru-RU'));
    const anchored=charts.some(chart=>{
      const points=chart.data??[];
      if(points.length<2)return false;
      const extreme=(minimum.test(headline)?Math.min:Math.max)(...points.map(p=>p.value));
      const winners=points.filter(p=>p.value===extreme);
      return winners.length===1&&hasContextQuote(headline,winners[0].name);
    });
    if(!quoted&&!anchored)return fail('Сравнение в заголовке не подтверждено: назови конкретную сравниваемую группу с единственным максимумом или минимумом. Не объявляй команду лидером, если сравнивались дни или статусы');
  }
  if(/(?:^|\s)[-*•]\s/.test(narrative))return fail('Замени список связным абзацем из двух законченных предложений, без маркеров');
  if(/равномерн/i.test(narrative)&&!/равномерн/i.test(source))return fail('Равномерность не указана в источнике. Удали это утверждение и опиши конкретные значения');
  if(/большинство|более половины|большая часть/i.test(`${headline} ${narrative}`)&&percentages(source).length&&percentages(source).every(p=>Number(p.replace('%',''))<=50))return fail('Доли в источнике не превышают 50%. Не называй их большинством ни в заголовке, ни в нарративе');
  const sentences=narrative.replace(/(млрд|млн|тыс|руб|долл)\.(?=\s+[а-яё])/g,'$1').split(/(?<=[.!?])\s+/);
  if(sentences.length<2||sentences.length>3||!/[.!?]$/.test(narrative))return fail('Нарратив должен содержать 2–3 законченных предложения');
  if(!Array.isArray(a.evidence)||!a.evidence.length||!a.evidence.every(evidence))return fail('Подтверди нарратив точными цитатами из источника в evidence');
  if(!Array.isArray(a.insights))return fail('Нужен список insights');
  const insights=a.insights.slice(0,3).map((i:any)=>{
    if(!i||!evidence(i.evidence))return fail('Показатель должен иметь цитату evidence');
    const value=prose(i.value);
    if(numbers(value).some(n=>!numbers(quote(i.evidence)).includes(n)))return fail('Число показателя должно быть в его цитате');
    return {label:prose(i.label),value};
  });
  return {headline,narrative,insights,charts};
}
