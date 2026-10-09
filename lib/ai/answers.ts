import {
  analyticsFacts,
  renderAnalytics,
  resolveAnalyticsText,
  type AnalyticsResult,
} from '../analytics';
import { gcChat, extractJson } from '../gigachat';
import { renderAnswer, type AnswerDraft } from '../answer';
import {
  ANSWER_LABEL_SYSTEM,
  ANALYTICS_ANSWER_SYSTEM,
} from '../prompts/table-chat';
export async function phraseTableAnswer(draft: AnswerDraft): Promise<string> {
  if (!draft.labels.length) return renderAnswer(draft);
  try {
    const output = await gcChat(
      [
        { role: 'system', content: ANSWER_LABEL_SYSTEM },
        { role: 'user', content: JSON.stringify(draft.labels.slice(0, 100)) },
      ],
      { temperature: 0, max_tokens: 4000 }
    );
    const labels = extractJson<Record<string, unknown>>(output);
    return renderAnswer(
      draft,
      labels && typeof labels === 'object' ? labels : {}
    );
  } catch {
    // Grammar assistance may fail; computed facts and a readable fallback remain available.
    return renderAnswer(draft);
  }
}
export async function phraseAnalytics(
  result: AnalyticsResult,
  question: string
): Promise<string> {
  if (!result.rows.length) return renderAnalytics(result);
  try {
    const output = await gcChat(
      [
        { role: 'system', content: ANALYTICS_ANSWER_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            facts: analyticsFacts(result).map(({ id, row, column, value }) => ({
              id,
              row,
              column,
              type: typeof value,
              value: typeof value === 'number' ? undefined : value,
            })),
          }),
        },
      ],
      { temperature: 0, max_tokens: 2200 }
    );
    return resolveAnalyticsText(output, result) ?? renderAnalytics(result);
  } catch {
    return renderAnalytics(result);
  }
}
