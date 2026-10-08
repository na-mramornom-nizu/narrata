import type { Analysis, Dataset } from './types';
import { FileInputError } from './parse';
import { requestBody } from './request-body';

type Options = {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function isAnalysis(value: unknown): value is Analysis {
  if (!value || typeof value !== 'object') return false;
  const a = value as Partial<Analysis>;
  return typeof a.headline === 'string' && !!a.headline.trim()
    && typeof a.narrative === 'string' && !!a.narrative.trim()
    && Array.isArray(a.charts) && Array.isArray(a.insights);
}

// All attempts share a deadline. Callers stay in the analyzing state until
// this resolves with a checked report or exhausts recoverable failures.
export async function requestAnalysis(dataset: Dataset, options: Options = {}): Promise<Analysis> {
  const body = requestBody(dataset);
  const signal = options.signal ?? AbortSignal.timeout(180_000);
  const fetcher = options.fetcher ?? fetch;
  const wait = options.wait ?? waitForRetry;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal,
      });
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === 2) throw error;
      await wait(1000, signal);
      continue;
    }
    const payload = await response.json().catch(() => null);
    signal.throwIfAborted();
    if (response.ok && isAnalysis(payload)) return payload;
    const errorMessage = typeof payload?.error === 'string' && payload.error.trim() ? payload.error
      : response.ok ? 'ИИ вернул неполный отчёт. Повторите анализ — данные уже загружены.'
      : 'Не удалось завершить анализ после повторных попыток. Данные сохранены — попробуйте ещё раз через минуту.';
    const retryable = payload?.retryable !== false && (
      response.ok || [429, 502, 504].includes(response.status)
      || (response.status === 503 && payload?.retryable === true)
    );
    if (!retryable || attempt === 2) throw new FileInputError(errorMessage);
    await wait(1000, signal);
  }
  throw new FileInputError('Не удалось завершить анализ. Повторите запрос.');
}
