import {
  concentrationFinding,
  renderConcentration,
} from '../concentration-narrative';
import { gcChat, extractJson, type GCMessage } from '../gigachat';
import type { Analysis, Dataset } from '../types';
import { metricDescription } from '../answer';
import {
  prepareAnalysis,
  resolveAnalysis,
  narrativeFacts,
} from '../analysis-plan';
import { extractEditorial, refineAndVerifyNarrative } from './narrative';
import {
  TABLE_CONTEXT_SYSTEM,
  TABLE_CHARTS_SYSTEM,
  CONCENTRATION_LABELS_SYSTEM,
  TABLE_NARRATIVE_SYSTEM,
  CHART_LABELS_SYSTEM,
  repairTableCharts,
  tableNarrativeContext,
  repairTableNarrative,
} from '../prompts/table-analysis';
export async function analyzeTable(dataset: Dataset): Promise<Analysis> {
  const context = prepareAnalysis(dataset);
  const sourceContext = (
    await gcChat(
      [
        { role: 'system', content: TABLE_CONTEXT_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            source: dataset.name,
            columns: dataset.columns,
            examples: Array.from(
              { length: Math.min(8, dataset.rows.length) },
              (_, i) =>
                dataset.rows[
                  Math.floor(
                    (i * (dataset.rows.length - 1)) /
                      Math.max(1, Math.min(8, dataset.rows.length) - 1)
                  )
                ]
            ).map((row) =>
              Object.fromEntries(
                dataset.columns
                  .slice(0, 12)
                  .map((column) => [
                    column,
                    String(row[column] ?? '').slice(0, 150),
                  ])
              )
            ),
          }),
        },
      ],
      { temperature: 0, max_tokens: 150 }
    )
  )
    .trim()
    .replace(/^[#*\s]+|[.\s]+$/g, '')
    .slice(0, 180);
  const selectionMessages: GCMessage[] = [
    { role: 'system', content: TABLE_CHARTS_SYSTEM },
    {
      role: 'user',
      content: JSON.stringify({
        source: context.source,
        columns: context.columns,
        views: context.views.map(({ id, meaning, types, points }) => ({
          id,
          meaning,
          types,
          points,
        })),
      }),
    },
  ];
  let selection: {
    charts: unknown[];
  } = { charts: [] };
  for (let attempt = 0; attempt < 3; attempt++) {
    const output = await gcChat(selectionMessages, {
      temperature: 0,
      max_tokens: 1800,
    });
    try {
      selection = extractJson<{
        charts: unknown[];
      }>(output);
      const seen = new Set<string>();
      selection.charts = selection.charts.filter((chart: any) => {
        const view = context.views.find((view) => view.id === chart.view);
        if (!view || seen.has(view.id)) return false;
        seen.add(view.id);
        if (!view.types.includes(chart.type)) chart.type = view.types[0];
        return true;
      });
      resolveAnalysis(
        {
          headline: 'Проверка выбора',
          narrative: 'Графики выбраны по данным. Значения рассчитаны по файлу.',
          insights: [0, 1, 2].map(() => ({ label: 'Записи', fact: 'f0' })),
          charts: selection.charts,
        },
        context
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      selectionMessages.push(
        { role: 'assistant', content: output },
        { role: 'user', content: repairTableCharts((error as Error).message) }
      );
    }
  }
  const selected = context.views.filter((view) =>
    selection.charts?.some((chart: any) => chart.view === view.id)
  );
  // One coherent breakdown per narrative avoids merging independent
  // dimensions (e.g. sex and ticket class) into unsupported joint groups.
  const focus = selected.find((view) => view.spec.yKey) || selected[0];
  const facts = narrativeFacts(dataset, focus);
  const editorialContext = { ...context, facts };
  const concentration = concentrationFinding(dataset, focus?.spec);
  let concentrationDraft:
    | {
        headline: string;
        narrative: string;
      }
    | undefined;
  if (concentration) {
    try {
      const labels = extractJson<{
        metric: string;
        groups: string;
        leaders: string[];
      }>(
        await gcChat(
          [
            { role: 'system', content: CONCENTRATION_LABELS_SYSTEM },
            {
              role: 'user',
              content: JSON.stringify({
                metric: metricDescription(concentration.metric).name,
                category: concentration.category,
                leaders: concentration.leaders,
                subject: sourceContext,
              }),
            },
          ],
          { temperature: 0, max_tokens: 350 }
        )
      );
      if (
        typeof labels.metric === 'string' &&
        typeof labels.groups === 'string' &&
        Array.isArray(labels.leaders) &&
        labels.leaders.length === 3 &&
        [labels.metric, labels.groups, ...labels.leaders].every(
          (s) =>
            typeof s === 'string' &&
            s.trim() &&
            s.length < 100 &&
            !/[\n:;!?%]/.test(s)
        )
      ) {
        concentrationDraft = renderConcentration(concentration, {
          ...labels,
          groups: labels.groups.toLocaleLowerCase('ru-RU'),
        });
      }
    } catch {
      /* The standard narrative path can recover from a label failure. */
    }
  }
  const messages: GCMessage[] = [
    { role: 'system', content: TABLE_NARRATIVE_SYSTEM },
    {
      role: 'user',
      content:
        JSON.stringify({
          source: context.source,
          subject: sourceContext,
          facts: Object.fromEntries(
            facts.map((f) => [f.id, `${f.meaning}: ${f.value}`])
          ),
        }) + tableNarrativeContext(sourceContext),
    },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const output = concentrationDraft
      ? ''
      : await gcChat(messages, { temperature: 0, max_tokens: 1200 });
    try {
      const draft = concentrationDraft ?? extractEditorial(output);
      if (!concentrationDraft)
        await refineAndVerifyNarrative(draft, {
          subject: sourceContext,
          facts: Object.fromEntries(facts.map((f) => [f.meaning, f.value])),
        });
      const checked = { ...draft, insights: [] };
      const result = resolveAnalysis(
        { ...checked, charts: selection.charts },
        editorialContext
      );
      const items: {
        id: string;
        column?: string;
        value: string;
      }[] = [];
      const chartItems = result.charts.map((chart, chartIndex) => {
        const chosen = selection.charts[chartIndex] as {
          view: string;
        };
        const view = selected.find((v) => v.id === chosen.view);
        return (view?.points ?? []).map((point) => {
          let item = items.find(
            (item) => item.column === chart.xKey && item.value === point.name
          );
          if (!item) {
            item = {
              id: `label${items.length}`,
              column: chart.xKey,
              value: point.name,
            };
            items.push(item);
          }
          return item;
        });
      });
      try {
        const labels = extractJson<Record<string, string>>(
          await gcChat(
            [
              { role: 'system', content: CHART_LABELS_SYSTEM },
              { role: 'user', content: JSON.stringify(items) },
            ],
            { temperature: 0, max_tokens: 1500 }
          )
        );
        result.charts.forEach((chart, index) => {
          const mapped = chartItems[index].map((item) =>
            typeof labels[item.id] === 'string' &&
            labels[item.id].trim() &&
            labels[item.id].length < 100 &&
            !/[=:]/.test(labels[item.id])
              ? labels[item.id].trim()
              : item.value
          );
          if (new Set(mapped).size === mapped.length)
            chart.labels = Object.fromEntries(
              chartItems[index].map((item, i) => [item.value, mapped[i]])
            );
        });
      } catch {
        /* Source labels remain usable if translation fails. */
      }
      return result;
    } catch (error) {
      if (attempt === 2)
        throw new Error('Не удалось сформировать достоверный AI-нарратив', {
          cause: error,
        });
      messages[1].content += repairTableNarrative(
        (error as Error).message,
        facts.map((f) => `${f.meaning}: ${f.value}`).join('; ')
      );
    }
  }
  throw new Error('Не удалось сформировать достоверный AI-нарратив');
}
