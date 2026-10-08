import { gcChat, hasGigaChat, extractJson } from './gigachat';
import type { Analysis, ChatMessage, Dataset } from './types';

export function buildDigest(d: Dataset, maxRows = 40): string {
  if (d.rows.length) {
    const sample = d.rows.slice(0, maxRows);
    return [
      `ИСТОЧНИК: ${d.name}`,
      `ТИП: таблица`,
      `ВСЕГО_СТРОК: ${d.rows.length}`,
      `КОЛОНКИ: ${d.columns.join(' | ')}`,
      `ПРИМЕР_СТРОК_JSON:`,
      JSON.stringify(sample),
    ].join('\n');
  }
  return [
    `ИСТОЧНИК: ${d.name}`,
    `ТИП: свободный текст (отчёт)`,
    `ТЕКСТ:`,
    (d.rawText || '').slice(0, 6000),
  ].join('\n');
}

const ANALYZE_SYSTEM = `Ты — старший дата-аналитик и рассказчик историй по данным.
Ты получаешь дайджест датасета: либо таблицу (колонки + примеры строк + общее число строк), либо свободный текст отчёта.

Верни ТОЛЬКО валидный JSON по схеме:
{
  "headline": string,
  "narrative": string,
  "insights": Array<{ "label": string, "value": string, "hint"?: string }>,
  "charts": Array<{
    "type": "bar" | "line" | "pie" | "area",
    "title": string,
    "subtitle": string,
    "xKey"?: string,
    "yKey"?: string | null,
    "aggregation"?: "count" | "sum" | "avg",
    "limit"?: number,
    "data"?: Array<{ "name": string, "value": number }>
  }>
}

ЖЁСТКИЕ ПРАВИЛА:
1. Никогда не выдумывай колонки и числа. Если источник — таблица, xKey/yKey ОБЯЗАНЫ быть точными именами колонок из дайджеста.
2. Выдай ровно 2 или 3 графика. Типы должны различаться.
3. Тип графика выбирай по смыслу: line/area для трендов во времени, bar для сравнений, pie для долей при малом числе категорий.
4. headline — 6–10 слов. narrative — 2–3 предложения. insights — ровно 3.
5. Весь текст — НА РУССКОМ ЯЗЫКЕ.
6. Будь конкретным. Запрещено писать «данные показывают интересные закономерности».
7. Если источник — свободный текст, агрегируй концептуально (частоты тем, статусов) и положи результат в поле "data".
8. Выведи ТОЛЬКО JSON. Без markdown-обёрток, без \`\`\`, без комментариев.`;

export async function analyze(dataset: Dataset): Promise<Analysis> {
  if (!hasGigaChat()) {
    const { demoAnalyze } = await import('./demo');
    return demoAnalyze(dataset);
  }

  const out = await gcChat(
    [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: buildDigest(dataset) },
    ],
    { temperature: 0.4, max_tokens: 2000 },
  );

  const parsed = extractJson<Analysis>(out);
  return sanitize(parsed, dataset);
}

function sanitize(a: Analysis, d: Dataset): Analysis {
  const cols = new Set(d.columns);
  const isTable = d.rows.length > 0;
  const charts = (a.charts || []).slice(0, 3).map((c) => {
    if (isTable) {
      if (!c.xKey || !cols.has(c.xKey)) c.xKey = d.columns[0];
      if (c.yKey && !cols.has(c.yKey)) c.yKey = null;
    }
    c.aggregation = c.aggregation ?? (c.yKey ? 'sum' : 'count');
    return c;
  });
  return {
    headline: a.headline || 'Анализ готов',
    narrative: a.narrative || '',
    insights: (a.insights || []).slice(0, 3),
    charts,
  };
}

const CHAT_SYSTEM = `Ты — ассистент по данным, встроенный в дашборд.
Отвечай ТОЛЬКО на основе дайджеста датасета. Если ответа в дайджесте нет — вежливо откажись, например: «В этом отчёте нет такой информации.»
Правила:
- Не угадывай. Не выдумывай строки, колонки и числа.
- 1–3 предложения. Конкретные числа, если они есть.
- Отвечай на русском языке.
- Без markdown, без списков.`;

export async function chat(dataset: Dataset, messages: ChatMessage[]): Promise<string> {
  if (!hasGigaChat()) {
    const { demoChat } = await import('./demo');
    return demoChat(dataset, messages.at(-1)?.content || '');
  }

  // GigaChat требует РОВНО одно system-сообщение и только первым.
  // Поэтому склеиваем инструкции и дайджест в один system.
  const systemPrompt = `${CHAT_SYSTEM}\n\nДАЙДЖЕСТ ДАТАСЕТА:\n${buildDigest(dataset)}`;

  const history: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const answer = await gcChat(history, { temperature: 0.2, max_tokens: 800 });
  return answer.trim() || 'Нет ответа.';
}