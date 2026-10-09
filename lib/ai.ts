import { hasGigaChat } from './gigachat';
import type { Analysis, ChatMessage, Dataset } from './types';
import { analyzeTable } from './ai/analyze-table';
import { analyzeText } from './ai/analyze-text';
import { chatTable } from './ai/chat-table';
import { chatText } from './ai/chat-text';

export { buildDigest } from './ai/context';

// API entry points: route by input shape; each workflow owns its validation and recovery.
export async function analyze(dataset: Dataset): Promise<Analysis> {
  if (!hasGigaChat()) throw new Error('AI_AUTH_NOT_CONFIGURED');
  return dataset.rows.length ? analyzeTable(dataset) : analyzeText(dataset);
}

export async function chat(
  dataset: Dataset,
  messages: ChatMessage[]
): Promise<string> {
  if (!hasGigaChat()) throw new Error('AI_AUTH_NOT_CONFIGURED');
  return dataset.rows.length
    ? chatTable(dataset, messages)
    : chatText(dataset, messages);
}
