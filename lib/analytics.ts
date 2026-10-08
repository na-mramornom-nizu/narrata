import type { Dataset } from './types';
import { formatNumber } from './table';
type Cell = string | number | boolean | null;
type RecordRow = Record<string, Cell>;
export type AnalyticsResult = { columns: string[]; rows: RecordRow[]; total: number; sourceRows: number; truncated?: boolean };

function displayValue(value: Cell, column: string): string {
  if (value===null) return 'не вычисляется';
  if (typeof value!=='number') return String(value);
  const unit=/процентн\S*\s+пункт|п\.\s*п\./i.test(column)?' п.п.':/%/.test(column)?'%':column.match(/\(([^()]+)\)$/)?.[1];
  return formatNumber(value)+(unit?(unit==='%'||unit===' п.п.'?unit:' '+unit):'');
}

export function sourceUnitsOnly(result: AnalyticsResult, dataset: Dataset, question: string): AnalyticsResult {
  const source=dataset.columns.join(' ')+' '+question;
  const families:[RegExp,RegExp][]=[[/тыс\.?/gi,/тыс|thousand/i],[/млн\.?/gi,/млн|million/i],[/млрд\.?/gi,/млрд|billion/i],[/руб(?:лей|ля|ль|\.)?/gi,/руб|RUB/i],[/доллар(?:ов|а|ы)?|USD|\$/gi,/доллар|USD|\$/i],[/евро|EUR|€/gi,/евро|EUR|€/i]];
  const columns=result.columns.map(column=>{let cleaned=column;for(const [unit,evidence] of families)if(!evidence.test(source))cleaned=cleaned.replace(new RegExp('(?<![\\p{L}\\p{N}])(?:'+unit.source+')(?![\\p{L}\\p{N}])','giu'),'');return cleaned.replace(/\(\s*\)/g,'').replace(/[,\s]+$/g,'').trim()||column;});
  if(new Set(columns).size!==columns.length)return result;
  return {...result,columns,rows:result.rows.map(row=>Object.fromEntries(result.columns.map((c,i)=>[columns[i],row[c]])))};
}

export function analyticsFacts(result: AnalyticsResult) {
  return result.rows.flatMap((row,r)=>result.columns.map((column,c)=>({id:`r${r}c${c}`,row:r,column,value:row[column],display:displayValue(row[column],column)})));
}

export function renderAnalytics(result: AnalyticsResult): string {
  if (!result.rows.length) return 'В файле нет записей, соответствующих этим условиям.';
  const rows=result.rows.map(row=>result.columns.map(c=>{
    const value=row[c];
    if(value===null)return `${c} не вычисляется: нет подходящих значений или знаменатель равен нулю`;
    if(typeof value!=='number')return String(value);
    const percent=/,\s*%$/.test(c), unit=c.match(/\(([^()]+)\)$/)?.[1];
    const label=c.replace(/,\s*%$/, '').replace(/\s*\([^()]+\)$/, '');
    return `${label} составляет ${formatNumber(value)}${percent?'%':unit?' '+unit:''}`;
  }).join('; ')+'.');
  return rows.join('\n')+(result.truncated?`\nПоказаны первые ${result.rows.length} результатов. Уточните фильтр, чтобы сократить список.`:result.total>result.rows.length?`\nПоказаны ${result.rows.length} из ${result.total} результатов.`:'');
}

export function resolveAnalyticsText(raw: string, result: AnalyticsResult): string | null {
  // Units travel with calculated values, never with model-written arithmetic.
  raw=raw.replace(/(\{\{r\d+c\d+\}\})\s*(?:%|п\.\s*п\.|процентных пунктов|процентов|процента)(?=[\s.,;!?]|$)/gi,'$1');
  const facts=analyticsFacts(result), byId=new Map(facts.map(f=>[f.id,f.display]));
  const references=[...raw.matchAll(/\{\{(r\d+c\d+)\}\}/g)].map(m=>m[1]);
  if(!raw.trim()||raw.length>7000||references.some(id=>!byId.has(id))||facts.some(f=>!references.includes(f.id))||/\d|[{}]/.test(raw.replace(/\{\{r\d+c\d+\}\}/g,'')))return null;
  let rendered=raw.replace(/\{\{(r\d+c\d+)\}\}/g,(_,id)=>byId.get(id)!);
  rendered=rendered.replace(/п\.п\.\./g,'п.п.').replace(/(млрд|млн|тыс)\s+\1(?=[\s.,;!?]|$)/g,'$1');
  return rendered+(result.truncated?`\nПоказаны первые ${result.rows.length} результатов. Уточните фильтр, чтобы сократить список.`:result.total>result.rows.length?`\nПоказаны ${result.rows.length} из ${result.total} результатов.`:'');
}

