import type { Analysis, Dataset } from './types';
import { NO_INFORMATION, rowWord } from './answer';

const isNum = (v: unknown) => v !== null && v !== '' && !Number.isNaN(Number(v));

export function demoAnalyze(d: Dataset): Analysis {
  if (!d.rows.length) {
    return {
      headline: 'Получен текстовый отчёт',
      narrative:
        'Укажите GIGACHAT_AUTH_KEY в .env.local, чтобы включить полноценный анализ. Сейчас — демо-режим.',
      insights: [
        { label: 'Источник', value: 'Текст' },
        { label: 'Символов', value: String(d.rawText?.length ?? 0) },
        { label: 'Режим', value: 'Демо' },
      ],
      charts: [
        {
          type: 'pie',
          title: 'Демо-распределение',
          subtitle: 'Для реальных данных добавьте ключ GigaChat',
          data: [
            { name: 'A', value: 40 },
            { name: 'B', value: 35 },
            { name: 'C', value: 25 },
          ],
        },
      ],
    };
  }

  const numCol = d.columns.find((c) => d.rows.some((r) => isNum(r[c])));
  const catCol = d.columns.find((c) => !isNum(d.rows[0]?.[c]));

  const charts = [];
  if (catCol)
    charts.push({
      type: 'bar' as const,
      title: `По «${catCol}»`,
      subtitle: 'Количество записей',
      xKey: catCol,
      yKey: null,
      aggregation: 'count' as const,
      limit: 6,
    });
  if (catCol && numCol)
    charts.push({
      type: 'pie' as const,
      title: `Доли по «${catCol}»`,
      subtitle: `Сумма «${numCol}»`,
      xKey: catCol,
      yKey: numCol,
      aggregation: 'sum' as const,
      limit: 5,
    });
  if (!catCol && numCol)
    charts.push({
      type: 'bar' as const,
      title: numCol,
      subtitle: 'Значения',
      xKey: d.columns[0],
      yKey: numCol,
      aggregation: 'sum' as const,
      limit: 8,
    });

  return {
    headline: `${d.rows.length} строк, ${d.columns.length} колонок`,
    narrative: `Демо-режим: ключ GigaChat не найден. Превью использует первую категориальную колонку («${catCol ?? '—'}») и первую числовую («${numCol ?? '—'}»). Добавьте GIGACHAT_AUTH_KEY для полноценного нарратива.`,
    insights: [
      { label: 'Строк', value: String(d.rows.length) },
      { label: 'Колонок', value: String(d.columns.length) },
      { label: 'Режим', value: 'Демо' },
    ],
    charts: charts.slice(0, 3),
  };
}

export function demoChat(d: Dataset, q: string): string {
  if (!d.rows.length) return NO_INFORMATION;
  const lc = q.toLowerCase();
  if (lc.includes('строк') || lc.includes('row')) return `В отчете ${d.rows.length} ${rowWord(d.rows.length)}.`;
  if (lc.includes('колон') || lc.includes('column')) return `Отчет содержит следующие поля: ${d.columns.join(', ')}.`;
  return NO_INFORMATION;
}
