import { alignComparison, renderComparison } from '../comparison';
import { gcChat, extractJson } from '../gigachat';
import type { ChatMessage, Dataset } from '../types';
import { NO_INFORMATION } from '../answer';
import { buildDigest } from './context';
import { TEXT_COMPARISON_SYSTEM, textChatPrompt } from '../prompts/text-chat';
export async function chatText(
  dataset: Dataset,
  messages: ChatMessage[]
): Promise<string> {
  if (/на сколько процентов/i.test(messages.at(-1)?.content ?? '')) {
    const question = messages.at(-1)!.content;
    const rawText = dataset.rawText ?? '';
    const passages = rawText
      .split(/(?<=[.!?])\s+|\n+/)
      .filter(Boolean)
      .map((text, id) => ({
        id,
        text,
        numbers: (text.match(/-?\d+(?:[.,]\d+)?/g) ?? []).map((n) =>
          Number(n.replace(',', '.'))
        ),
      }));
    const extracted = extractJson<{
      facts?: {
        name: string;
        passage: number;
        number: number;
      }[];
    }>(
      await gcChat(
        [
          { role: 'system', content: TEXT_COMPARISON_SYSTEM },
          { role: 'user', content: JSON.stringify({ question, passages }) },
        ],
        { temperature: 0, max_tokens: 1200 }
      )
    );
    const facts = extracted.facts?.map((f) => ({
      ...f,
      value: passages[f.passage]?.numbers[f.number],
    }));
    if (
      facts?.length === 2 &&
      facts.every(
        (f) =>
          typeof f.name === 'string' &&
          Number.isInteger(f.passage) &&
          Number.isInteger(f.number) &&
          Number.isFinite(f.value)
      )
    ) {
      const columns = facts.map((f) => f.name);
      if (columns[0] !== columns[1]) {
        const plan = alignComparison(question, {
          metrics: facts.map((f) => ({ name: f.name })),
          compare: [{ left: 0, right: 1, mode: 'relative_change' }],
        });
        const result = {
          columns,
          rows: [Object.fromEntries(facts.map((f) => [f.name, f.value]))],
          truncated: false,
          total: 1,
          sourceRows: 0,
        };
        return renderComparison(plan, result)!;
      }
    }
    if (!Array.isArray(extracted.facts) || extracted.facts.length)
      return 'Не удалось однозначно сопоставить числа в тексте с объектами сравнения. Уточните, какие два показателя нужно сравнить.';
    return NO_INFORMATION;
  }
  // GigaChat требует РОВНО одно system-сообщение и только первым.
  // Поэтому склеиваем инструкции и дайджест в один system.
  const systemPrompt = textChatPrompt(buildDigest(dataset));
  const history: {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const output = await gcChat(history, { temperature: 0, max_tokens: 1200 });
  try {
    const result = extractJson<{
      found?: boolean;
      answer?: string;
      evidence?: unknown[];
    }>(output);
    if (
      result.found !== true ||
      typeof result.answer !== 'string' ||
      !result.answer.trim()
    )
      return NO_INFORMATION;
    const text = (dataset.rawText ?? '').replace(/\s+/g, ' ').trim();
    if (
      !Array.isArray(result.evidence) ||
      !result.evidence.length ||
      !result.evidence.every(
        (quote) =>
          typeof quote === 'string' &&
          quote.trim() &&
          text.includes(quote.replace(/\s+/g, ' ').trim())
      )
    )
      return NO_INFORMATION;
    if (
      /нет (такой )?информации|не (указан|содержит)|отсутству[ею]т/i.test(
        result.answer
      )
    )
      return NO_INFORMATION;
    return result.answer.trim();
  } catch {
    return NO_INFORMATION;
  }
}
