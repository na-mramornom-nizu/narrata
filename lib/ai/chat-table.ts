import { alignComparison, renderComparison } from '../comparison';
import { compileCompute } from '../compute-query';
import { runSQL } from '../sql-query';
import { sourceUnitsOnly } from '../analytics';
import { gcChat, extractJson, type GCMessage } from '../gigachat';
import type { ChatMessage, Dataset } from '../types';
import { tableContext } from '../table';
import {
  prepareTableAnswer,
  InvalidQuery,
  planTableQuery,
} from '../table-query';
import { NO_INFORMATION } from '../answer';
import {
  SQL_SYSTEM,
  TABLE_QUERY_SYSTEM,
} from '../prompts/query-plans';
import {
  FOLLOWUP_QUESTION_SYSTEM,
  AVAILABILITY_SYSTEM,
  CONFIRM_MISSING_SYSTEM,
  MATCH_SUBJECTS_SYSTEM,
  clarificationPlanError,
  repairTablePlan,
  REPAIR_JSON_PLAN,
  UNSUPPORTED_PLAN_ERROR,
  COMPUTE_REQUIRED_ERROR,
  RANK_ORDER_ERROR,
  EMPTY_QUERY_ERROR,
  GENERAL_COMPUTE_SYSTEM,
  tablePlannerPrompt,
  fallbackTablePlannerPrompt,
} from '../prompts/table-chat';
import { phraseTableAnswer, phraseAnalytics } from './answers';
export async function chatTable(
  dataset: Dataset,
  messages: ChatMessage[]
): Promise<string> {
  const latestQuestion = messages.at(-1)?.content ?? '';
  // Only resolve references for follow-ups. A standalone question must not be
  // replaced by an older topic when the conversation grows.
  const needsContext =
    /(^|\s)(а|её|ее|его|их|они|он|она|это|этого|этой|этих|предыдущ\S*|выше|тогда|также|теперь|and|it|its|their|previous|those|them)(?=\s|[,.!?]|$)/iu.test(
      latestQuestion
    );
  const question =
    messages.length > 1 && needsContext
      ? await gcChat(
          [{ role: 'system', content: FOLLOWUP_QUESTION_SYSTEM }, ...messages],
          { temperature: 0, max_tokens: 500 }
        )
      : latestQuestion;
  const availability =
    /(?:сколько|количество).*(?:записей|строк)/i.test(question) &&
    !/стоим|цен|сумм|средн|населен/i.test(question)
      ? '{"missing":false}'
      : await gcChat(
          [
            { role: 'system', content: AVAILABILITY_SYSTEM },
            {
              role: 'user',
              content: JSON.stringify({
                source: dataset.name,
                columns: dataset.columns,
                examples: dataset.rows
                  .slice(0, 2)
                  .map((row) =>
                    Object.fromEntries(
                      dataset.columns.map((column) => [
                        column,
                        String(row[column] ?? '').slice(0, 100),
                      ])
                    )
                  ),
                question,
              }),
            },
          ],
          { temperature: 0, max_tokens: 100 }
        );
  const availabilityHint =
    extractJson<{
      missing?: boolean;
    }>(availability).missing === true;
  const confirmMissing = async () => {
    const confirmation = extractJson<{
      missing?: boolean;
    }>(
      await gcChat(
        [
          { role: 'system', content: CONFIRM_MISSING_SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              question,
              source: dataset.name,
              columns: JSON.parse(tableContext(dataset)).columns,
              examples: dataset.rows
                .slice(0, 2)
                .map((row) =>
                  Object.fromEntries(
                    dataset.columns.map((column) => [
                      column,
                      String(row[column] ?? '').slice(0, 100),
                    ])
                  )
                ),
            }),
          },
        ],
        { temperature: 0, max_tokens: 150 }
      )
    );
    return confirmation.missing === true;
  };
  if (availabilityHint && (await confirmMissing())) return NO_INFORMATION;
  const temporalQuestion =
    /предыдущ|накопитель|скользящ|динамик/i.test(question) &&
    /месяц|день|дня|квартал|недел|год|врем|период/i.test(question);
  const generalQuestion =
    /процент|дол[яюи]|медиан|перцент|коррел|ковариац|дисперс|отклон|взвеш|уник|дублик|пропуск|пуст|во сколько раз|отношени|по групп|по район|по класс|по полу|по статус|по отдел|по месяц|по квартал|по недел|по год|кросс|услови|одновременно|между групп/i.test(
      question
    ) || temporalQuestion;
  const generalSystem = GENERAL_COMPUTE_SYSTEM;
  const plannerSystem = temporalQuestion
    ? SQL_SYSTEM
    : generalQuestion
      ? generalSystem
      : TABLE_QUERY_SYSTEM;
  const planningMessages: GCMessage[] = [
    {
      role: 'system',
      content: tablePlannerPrompt(plannerSystem, tableContext(dataset)),
    },
    { role: 'user', content: question },
  ];
  let lastPlanError = '';
  // Two bounded repair attempts; only read-only, isolated queries may run.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 2 && !generalQuestion)
      planningMessages[0].content = fallbackTablePlannerPrompt(
        tableContext(dataset)
      );
    const plan = await gcChat(planningMessages, {
      temperature: 0,
      max_tokens: 3500,
    });
    let query: unknown;
    try {
      query = extractJson<unknown>(plan);
    } catch {
      planningMessages.push(
        { role: 'assistant', content: plan },
        { role: 'user', content: REPAIR_JSON_PLAN }
      );
      continue;
    }
    try {
      if (
        query &&
        typeof query === 'object' &&
        (
          query as {
            kind?: string;
          }
        ).kind === 'unsupported'
      ) {
        if (await confirmMissing()) return NO_INFORMATION;
        throw new InvalidQuery(UNSUPPORTED_PLAN_ERROR);
      }
      if (
        attempt === 0 &&
        query &&
        typeof query === 'object' &&
        (
          query as {
            kind?: string;
          }
        ).kind === 'clarify'
      ) {
        throw new InvalidQuery(clarificationPlanError(question));
      }
      if (
        query &&
        typeof query === 'object' &&
        ['difference', 'count_difference', 'aggregate', 'rank'].includes(
          String(
            (
              query as {
                kind?: string;
              }
            ).kind
          )
        ) &&
        /процент|дол[яюи]|медиан|перцент|коррел|отклонен|дисперс|во сколько раз|динамик|по месяц|по квартал/i.test(
          question
        )
      )
        throw new InvalidQuery(COMPUTE_REQUIRED_ERROR);
      if (
        query &&
        typeof query === 'object' &&
        (
          query as {
            kind?: string;
          }
        ).kind === 'compute'
      ) {
        if (
          /наибольш|наименьш|топ|лидер/i.test(question) &&
          !(
            query as {
              orderBy?: unknown;
            }
          ).orderBy
        )
          throw new InvalidQuery(RANK_ORDER_ERROR);
        const aligned = alignComparison(question, query, dataset);
        const result = sourceUnitsOnly(
          await runSQL(dataset, compileCompute(dataset, aligned)),
          dataset,
          question
        );
        return (
          renderComparison(aligned, result) ??
          (await phraseAnalytics(result, question))
        );
      }
      if (
        query &&
        typeof query === 'object' &&
        (
          query as {
            kind?: string;
          }
        ).kind === 'sql'
      ) {
        let sql = (
          query as {
            sql?: unknown;
          }
        ).sql;
        const result = sourceUnitsOnly(
          await runSQL(dataset, sql),
          dataset,
          question
        );
        if (
          attempt === 0 &&
          (!result.rows.length ||
            result.rows.every((row) =>
              Object.values(row).every((value) => value === null)
            ))
        )
          throw new InvalidQuery(EMPTY_QUERY_ERROR);
        return await phraseAnalytics(result, question);
      }
      try {
        return await phraseTableAnswer(
          prepareTableAnswer(dataset, planTableQuery(query, dataset))
        );
      } catch (error) {
        const candidate = query as {
          subjectColumn?: string;
          subjects?: unknown[];
        };
        if (
          !(error instanceof InvalidQuery) ||
          !/нет точного значения/.test(error.message) ||
          !candidate.subjectColumn ||
          !Array.isArray(candidate.subjects)
        )
          throw error;
        const values = [
          ...new Set(dataset.rows.map((row) => row[candidate.subjectColumn!])),
        ];
        if (values.length > 2000) throw error;
        const selection = extractJson<{
          indices?: number[];
        }>(
          await gcChat(
            [
              { role: 'system', content: MATCH_SUBJECTS_SYSTEM },
              {
                role: 'user',
                content: JSON.stringify({
                  subjects: candidate.subjects,
                  values,
                }),
              },
            ],
            { temperature: 0, max_tokens: 300 }
          )
        );
        if (
          selection.indices?.length !== candidate.subjects.length ||
          !selection.indices.every(
            (i) => Number.isInteger(i) && i >= 0 && i < values.length
          )
        )
          throw error;
        return await phraseTableAnswer(
          prepareTableAnswer(
            dataset,
            planTableQuery(
              {
                ...candidate,
                subjects: selection.indices.map((i) => values[i]),
              },
              dataset
            )
          )
        );
      }
    } catch (error) {
      if (!(error instanceof InvalidQuery)) throw error;
      lastPlanError = error.message;
      planningMessages.push(
        { role: 'assistant', content: plan },
        {
          role: 'user',
          content: repairTablePlan(
            messages.at(-1)?.content,
            question,
            error.message
          ),
        }
      );
    }
  }
  if (
    /лимит времени|ограничени.*ресурс|Недостаточно ресурсов/.test(lastPlanError)
  )
    return 'Этот расчет требует больше времени или памяти, чем доступно для одного запроса. Сузьте период, группы или список показателей и повторите вопрос.';
  return 'Не удалось однозначно разобрать вопрос. Уточните названия колонок, объектов и нужное действие.';
}
