const test = require('node:test');
const assert = require('node:assert/strict');
const { requestAnalysis } = require('../lib/analysis-request.ts');
const dataset = { name: 'Отчёт', source: 'text', rows: [], columns: [], rawText: 'Из 50 задач 20 находятся на ревью.' };
const fileDataset = { name: 'report.csv', source: 'file', columns: ['Задачи'], rows: [{ Задачи: 20 }] };
const report = { headline: 'Задачи ожидают проверки', narrative: 'На ревью находятся 20 задач. Всего в отчёте 50 задач.', charts: [], insights: [] };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const options = (fetcher) => ({ fetcher, wait: async () => {}, signal: new AbortController().signal });

test('failed validation stays pending through automatic retry and returns only a valid report', async () => {
  let calls = 0, complete = false;
  let release;
  const pendingResponse = new Promise(resolve => { release = resolve; });
  const task = requestAnalysis(dataset, options(async () => ++calls === 1
    ? response({ error: 'Выводы не прошли проверку', retryable: true }, 502) : pendingResponse));
  task.then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(complete, false);
  release(response(report));
  assert.deepEqual(await task, report);
});

test('files retain a bounded retry limit', async () => {
  let calls = 0;
  await assert.rejects(requestAnalysis(fileDataset, options(async () => {
    calls++;
    return response({ error: 'Не удалось проверить выводы', retryable: true }, 502);
  })), /Не удалось проверить выводы/);
  assert.equal(calls, 3);
});

test('authentication and bad input stop immediately for files', async () => {
  for (const status of [400, 503]) {
    let calls = 0;
    await assert.rejects(requestAnalysis(fileDataset, options(async () => {
      calls++;
      return response({ error: 'Проверьте подключение', retryable: false }, status);
    })), /Проверьте подключение/);
    assert.equal(calls, 1);
  }
});

test('text continues beyond three failures and uses a bounded backoff until a valid report', async () => {
  let calls = 0;
  const pauses = [];
  const result = await requestAnalysis(dataset, {
    ...options(async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      if (calls === 2) return response({ error: 'Unavailable', retryable: false }, 503);
      if (calls === 3) return response({ headline: 'Incomplete' });
      if (calls <= 8) return response({ error: 'Validation failed' }, 502);
      return response(report);
    }),
    wait: async ms => { pauses.push(ms); },
  });
  assert.deepEqual(result, report);
  assert.equal(calls, 9);
  assert.deepEqual(pauses, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});

test('cancelling an active text request rejects even if a late report arrives', async () => {
  const controller = new AbortController();
  let release;
  const task = requestAnalysis(dataset, {
    ...options(async () => new Promise(resolve => { release = resolve; })),
    signal: controller.signal,
  });
  controller.abort(new Error('New dataset'));
  release(response(report));
  await assert.rejects(task, /New dataset/);
});

test('cancelling text during the actual retry pause prevents another request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const task = requestAnalysis(dataset, {
    fetcher: async () => { calls++; return response({ error: 'Validation failed' }, 502); },
    signal: controller.signal,
  });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(new Error('New dataset'));
  await assert.rejects(task, /New dataset/);
  assert.equal(calls, 1);
});

test('platform timeout, temporary network failure and incomplete response recover automatically', async () => {
  for (const first of ['timeout', 'network', 'incomplete']) {
    let calls = 0;
    const result = await requestAnalysis(dataset, options(async () => {
      if (++calls > 1) return response(report);
      if (first === 'network') throw new TypeError('Failed to fetch');
      if (first === 'timeout') return new Response('Gateway timeout', { status: 504 });
      return response({ headline: 'Без абзаца' });
    }));
    assert.deepEqual(result, report);
    assert.equal(calls, 2);
  }
});

test('shared cancellation deadline prevents further requests', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestAnalysis(dataset, {
    ...options(async () => { calls++; return response({ retryable: true }, 502); }),
    signal: controller.signal,
    wait: async () => { controller.abort(new Error('deadline reached')); },
  }), /deadline reached/);
  assert.equal(calls, 1);
});
