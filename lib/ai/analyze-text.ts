import { includeTextContext, textContextSubject } from '../narrative-context';
import { gcChat, extractJson, type GCMessage } from '../gigachat';
import type { Analysis, Dataset } from '../types';
import {
  mentionsTextCategory,
  resolveTextAnalysis,
  resolveTextCharts,
  sourceTextNarrative,
  textDistributionFinding,
  textPassages,
} from '../text-analysis';
import { extractEditorial, refineAndVerifyNarrative } from './narrative';
import {
  TEXT_FINDING_TITLE_SYSTEM,
  TEXT_CHARTS_SYSTEM,
  TEXT_NARRATIVE_SYSTEM,
  repairTextCharts,
  specificTextNarrativePrompt,
  textDistributionContext,
  repairTextNarrative,
} from '../prompts/text-analysis';
async function phraseTextFinding(
  finding: NonNullable<ReturnType<typeof textDistributionFinding>>
): Promise<string | undefined> {
  const groups = finding.leaders.slice(0, 2);
  try {
    const title = (
      await gcChat(
        [
          { role: 'system', content: TEXT_FINDING_TITLE_SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              metric: finding.metric,
              left: groups[0].name.replace(/^наход(?:ится|ятся)\s+/iu, ''),
              right: groups[1]?.name.replace(/^наход(?:ится|ятся)\s+/iu, ''),
              relation:
                groups.length === 2
                  ? 'равное количество'
                  : 'единственное наибольшее значение',
            }),
          },
        ],
        { temperature: 0, max_tokens: 140 }
      )
    )
      .trim()
      .replace(/^[#*\s]+|[*\s]+$/g, '');
    if (
      !title ||
      title.length > 100 ||
      /\d|\n|групп|категори|дол[яиюе]|распределени|в статусе|большинство|большая часть/iu.test(
        title
      ) ||
      !groups.every((group) => mentionsTextCategory(title, group.name))
    )
      return;
    if (
      groups.length === 2 &&
      !/равн|одинак|столько\s+же|поровну|совпада/iu.test(title)
    )
      return;
    return title;
  } catch {
    return;
  }
}
export async function analyzeText(dataset: Dataset): Promise<Analysis> {
  const source = dataset.rawText ?? '';
  const textStarted = Date.now();
  const messages: GCMessage[] = [
    { role: 'system', content: TEXT_CHARTS_SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        source: dataset.name,
        passages: textPassages(source),
      }),
    },
  ];
  let charts: unknown[] = [];
  // Select and validate charts once. Wording failures must not discard them.
  for (let attempt = 0; attempt < 3; attempt++) {
    const output = await gcChat(messages, { temperature: 0, max_tokens: 1600 });
    try {
      const raw = extractJson(output);
      if (raw.insufficient === true && !/\d/.test(source))
        return {
          headline: 'Недостаточно данных для анализа',
          narrative:
            'В тексте не найдено фактов для аналитического отчёта. Добавьте описание результатов, показателей или событий, которые нужно проанализировать.',
          insights: [],
          charts: [],
        };
      resolveTextCharts(raw.charts, source);
      charts = raw.charts;
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      messages.push(
        { role: 'assistant', content: output },
        { role: 'user', content: repairTextCharts((error as Error).message) }
      );
    }
  }
  const subject = textContextSubject(source);
  const editorialMessages: GCMessage[] = [
    { role: 'system', content: TEXT_NARRATIVE_SYSTEM },
    { role: 'user', content: source },
  ];
  const distributionFinding = textDistributionFinding(
    resolveTextCharts(charts, source)
  );
  const specificHeadline =
    distributionFinding && Date.now() - textStarted < 15000
      ? await phraseTextFinding(distributionFinding)
      : undefined;
  if (specificHeadline)
    editorialMessages[0].content =
      specificTextNarrativePrompt(specificHeadline);
  if (distributionFinding)
    editorialMessages[0].content +=
      textDistributionContext(distributionFinding);
  for (let attempt = 0; attempt < 3; attempt++) {
    // Leave room for a single model request within Vercel's 60-second limit.
    // A checked source extract can finish immediately if wording takes too long.
    if (Date.now() - textStarted >= 15000) break;
    let output = '';
    try {
      output = await gcChat(editorialMessages, {
        temperature: 0,
        max_tokens: 600,
      });
      const editorial = extractEditorial(output);
      if (specificHeadline) editorial.headline = specificHeadline;
      editorial.narrative = includeTextContext(editorial.narrative, source);
      const raw = {
        ...editorial,
        charts,
        evidence: textPassages(source).map((p) => p.id),
      };
      // Reject arithmetic/formatting mistakes before another model request.
      resolveTextAnalysis(raw, source);
      if (Date.now() - textStarted >= 15000) break;
      await refineAndVerifyNarrative(raw, { subject, text: source }, false);
      return resolveTextAnalysis(raw, source);
    } catch (error) {
      if (
        !output ||
        attempt === 2 ||
        /GigaChat|AI_AUTH|ECONN|ETIMEDOUT|socket/i.test(
          (error as Error).message
        )
      )
        break;
      editorialMessages.push(
        { role: 'assistant', content: output },
        { role: 'user', content: repairTextNarrative((error as Error).message) }
      );
    }
  }
  const extract = sourceTextNarrative(
    source,
    resolveTextCharts(charts, source)
  );
  return resolveTextAnalysis(
    { ...extract, headline: specificHeadline ?? extract.headline, charts },
    source
  );
}
