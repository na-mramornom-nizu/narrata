import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import type { Dataset } from './types';
import { numericColumns } from './table';
import { InvalidQuery } from './table-query';
import { SQL_WORKER } from './sql-worker';
import type { AnalyticsResult } from './analytics';

export function validateSQL(raw: unknown): string {
  if(typeof raw!=='string'||!raw.trim()||raw.length>16000)throw new InvalidQuery('Нужен один SELECT-запрос длиной до 16000 символов.');
  const sql=raw.trim().replace(/;\s*$/,'');
  // Mask quoted strings/identifiers and comments before examining SQL tokens.
  const tokens=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,' ');
  if(!/^\s*(SELECT|WITH)\b/i.test(tokens)||/;|\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace|reindex|load_extension|readfile|writefile|randomblob|zeroblob|sqlite_master|sqlite_schema|pragma_table_info)\b/i.test(tokens))throw new InvalidQuery('Разрешен только один запрос чтения SELECT/WITH по таблице data.');
  return sql;
}

export async function runSQL(dataset: Dataset, raw: unknown, timeoutMs=8000): Promise<AnalyticsResult> {
  const sql=validateSQL(raw);
  const withoutLiterals=sql.replace(/'(?:''|[^'])*'|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//g,' ');
  const aliases=[...withoutLiterals.matchAll(/\bAS\s+"((?:""|[^"])*)"/gi)].map(m=>m[1].replace(/""/g,'"'));
  const known=new Set([...dataset.columns,...aliases,'data'].map(s=>s.toLocaleLowerCase()));
  for(const match of withoutLiterals.matchAll(/"((?:""|[^"])*)"/g)) {
    const identifier=match[1].replace(/""/g,'"');
    if(!known.has(identifier.toLocaleLowerCase()))throw new InvalidQuery(`Неизвестная колонка или псевдоним: ${identifier}. Не используй двойные кавычки для строковых значений.`);
  }
  return new Promise((resolve,reject)=>{
    const worker=new Worker(SQL_WORKER,{eval:true,workerData:{dataset,sql,numericColumns:numericColumns(dataset),engine:join(process.cwd(),'node_modules/sql.js/dist/sql-asm.js')},resourceLimits:{maxOldGenerationSizeMb:192}});
    const timer=setTimeout(()=>{void worker.terminate();reject(new InvalidQuery('Расчет превысил лимит времени. Упрости запрос, убери избыточные соединения.'));},timeoutMs);
    worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.error?reject(new InvalidQuery(message.error)):resolve(message.result);});
    worker.once('error',()=>{clearTimeout(timer);reject(new InvalidQuery('Недостаточно ресурсов для этого расчета. Упрости запрос.'));});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new InvalidQuery('Расчет остановлен из-за ограничения ресурсов.'));});
  });
}

export { SQL_SYSTEM } from './prompts/query-plans';
