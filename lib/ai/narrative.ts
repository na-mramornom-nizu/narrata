import { hasNarrativeContext } from '../narrative-context';
import { gcChat, extractJson } from '../gigachat';
import {
  SHORTEN_TITLE_SYSTEM,
  EDIT_NARRATIVE_SYSTEM,
  VERIFY_NARRATIVE_SYSTEM,
  MISSING_CONTEXT_ERROR,
} from '../prompts/narrative';
export function extractEditorial(output: string): {
  headline: string;
  narrative: string;
  insights: never[];
} {
  const lines = output
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^#+\s*|\*\*/g, '')
        .replace(
          /^(?:headline|narrative|title|головной заголовок|заголовок|нарратив|абзац|текст)\s*:\s*/i,
          ''
        )
    )
    .filter(
      (line) =>
        line &&
        !/^(headline|narrative|title|заголовок|нарратив|абзац|текст):?$/i.test(
          line
        )
    );
  if (lines.length === 1)
    lines.splice(0, 1, ...lines[0].split(/(?<=[.!?])\s+/));
  if (lines.length < 2)
    throw new Error(
      'Нужен заголовок на отдельной строке и абзац из двух-трех предложений'
    );
  return {
    headline: lines[0],
    narrative: lines
      .slice(1)
      .join(' ')
      .replace(/^Наблюдение:\s*/i, '')
      .replace(/\([^()]*=[^()]*\)/g, '')
      .replace(/ +/g, ' ')
      .trim(),
    insights: [],
  };
}
export async function refineAndVerifyNarrative(
  draft: {
    headline: string;
    narrative: string;
  },
  evidence: unknown,
  edit = true
): Promise<void> {
  const subject =
    evidence &&
    typeof evidence === 'object' &&
    'subject' in evidence &&
    typeof evidence.subject === 'string'
      ? evidence.subject
      : undefined;
  const titleKey = (text: string) =>
    text
      .toLocaleLowerCase('ru-RU')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  if (
    draft.headline.length > 100 ||
    draft.headline.split(/\s+/).length > 12 ||
    /\d/.test(draft.headline) ||
    (subject && titleKey(draft.headline) === titleKey(subject))
  ) {
    // Formatting repairs must not turn a usable report into a service error.
    try {
      const title = (
        await gcChat(
          [
            { role: 'system', content: SHORTEN_TITLE_SYSTEM },
            {
              role: 'user',
              content: JSON.stringify({
                headline: draft.headline,
                paragraph: draft.narrative,
              }),
            },
          ],
          { temperature: 0, max_tokens: 120 }
        )
      )
        .trim()
        .replace(/^[#*\s]+|[*\s]+$/g, '');
      if (
        title &&
        title.length <= 100 &&
        title.split(/\s+/).length <= 12 &&
        !/\d|\n|вдвое|втрое|вчетверо|впятеро|в несколько раз/i.test(title)
      )
        draft.headline = title;
    } catch {
      /* Keep the draft for the factual validation below. */
    }
  }
  if (edit)
    draft.narrative = (
      await gcChat(
        [
          { role: 'system', content: EDIT_NARRATIVE_SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              paragraph: draft.narrative,
              source: evidence,
            }),
          },
        ],
        { temperature: 0, max_tokens: 900 }
      )
    ).trim();
  const result = extractJson<{
    supported: boolean;
    contextPresent: boolean;
    contextQuote?: string;
    reason?: string;
  }>(
    await gcChat(
      [
        { role: 'system', content: VERIFY_NARRATIVE_SYSTEM },
        { role: 'user', content: JSON.stringify({ draft, evidence }) },
      ],
      { temperature: 0, max_tokens: 400 }
    )
  );
  const hasContext =
    result.contextPresent === true &&
    hasNarrativeContext(draft.narrative, result.contextQuote ?? '', subject);
  if (result.supported !== true || !hasContext)
    throw new Error(result.reason || MISSING_CONTEXT_ERROR);
}
