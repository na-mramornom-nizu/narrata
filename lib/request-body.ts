// Leave room below the hosting platform's 4.5 MB request limit.
export const MAX_REQUEST_BYTES=4_000_000;
export class RequestLimitError extends Error {}
export function requestBody(value:unknown):string {
  const body=JSON.stringify(value);
  if(new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES)throw new RequestLimitError('Данные вместе с историей чата слишком велики для одного запроса. Загрузите меньшую таблицу или начните новый анализ.');
  return body;
}
