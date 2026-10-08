import type { ChatMessage, Dataset } from './types';

export function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== 'object') return false;
  const data = value as Dataset;
  return typeof data.name === 'string' && ['file', 'text'].includes(data.source)
    && Array.isArray(data.columns) && data.columns.every((column) => typeof column === 'string')
    && new Set(data.columns).size === data.columns.length
    && Array.isArray(data.rows) && data.rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row)
      && Object.keys(row).every(key=>data.columns.includes(key))
      && Object.values(row).every((cell) => cell === null || typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell))))
    && (data.rows.length > 0 ? data.columns.length > 0 : typeof data.rawText === 'string' && data.rawText.trim().length > 0 && data.rawText.length<=50_000);
}

export function isChatHistory(value: unknown): value is ChatMessage[] {
  return Array.isArray(value) && value.length > 0 && value.every((message) => message && typeof message === 'object'
    && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim().length > 0)
    && value[0].role === 'user' && value.at(-1).role === 'user';
}
