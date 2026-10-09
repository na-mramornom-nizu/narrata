import type { Dataset } from '../types';
import { tableContext } from '../table';
export function buildDigest(d: Dataset): string {
  if (d.rows.length) {
    return tableContext(d);
  }
  return [
    `ИСТОЧНИК: ${d.name}`,
    `ТИП: свободный текст (отчёт)`,
    `ТЕКСТ:`,
    d.rawText || '',
  ].join('\n');
}
