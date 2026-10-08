'use client';
import { motion } from 'framer-motion';
import { Sparkles, AlertTriangle, RotateCcw, Download, Loader2, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { Dropzone } from '@/components/Dropzone';
import { NarrativeHero } from '@/components/NarrativeHero';
import { ChartCard } from '@/components/ChartCard';
import { ChatPanel } from '@/components/ChatPanel';
import { DashboardSkeleton } from '@/components/Skeletons';
import { Button, Card } from '@/components/ui';
import { parseFile, datasetFromText, FileInputError } from '@/lib/parse';
import type { Analysis, ChatMessage, Dataset } from '@/lib/types';
import { requestBody, RequestLimitError } from '@/lib/request-body';

type Phase = 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error';

export default function Page() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState('Не удалось прочитать файл');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatThinking, setChatThinking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const canExport = phase === 'ready' && !!dataset && !!analysis && !exporting && !chatThinking;

  const reset = () => {
    setPhase('idle'); setDataset(null); setAnalysis(null); setError(null);
    setMessages([]); setChatThinking(false); setExportError(null);
  };

  const exportPdf = async () => {
    if (!canExport || !dataset || !analysis) return;
    setExporting(true);
    setExportError(null);
    try {
      const { downloadReport } = await import('@/lib/download-report');
      await downloadReport({ dataset, analysis, messages: [...messages], createdAt: new Date() });
    } catch {
      setExportError('Не удалось создать PDF. Попробуйте скачать отчет еще раз.');
    } finally {
      setExporting(false);
    }
  };

  const ingest = async (fn: () => Promise<Dataset> | Dataset) => {
    setError(null); setAnalysis(null); setExportError(null); setPhase('parsing');
    let parsed = false;
    try {
      const ds = await fn();
      setDataset(ds); parsed = true;
      setPhase('analyzing');
      const res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody(ds), signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new FileInputError(j.error || 'Сервис анализа временно недоступен. Повторите запрос через минуту.');
      }
      const a = (await res.json()) as Analysis;
      if (!a || typeof a.headline !== 'string' || !a.narrative?.trim() || !Array.isArray(a.charts) || !Array.isArray(a.insights)) throw new FileInputError('ИИ вернул неполный отчет. Повторите анализ — файл уже загружен.');
      setAnalysis(a);
      setPhase('ready');
    } catch (e: any) {
      setErrorTitle(parsed ? 'Анализ не завершён' : 'Не удалось прочитать файл');
      setError(e instanceof FileInputError || e instanceof RequestLimitError ? e.message : parsed ? 'Не удалось дождаться ответа сервиса. Проверьте подключение к интернету и повторите анализ.' : 'Файл не удалось открыть. Проверьте, что он открывается в табличном редакторе, и сохраните новую копию.');
      if (!parsed) setDataset(null);
      setPhase('error');
    }
  };

  const askData = async (messages: ChatMessage[]): Promise<string> => {
    if (!dataset) return 'Датасет не загружен.';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: requestBody({ dataset, messages }), signal: AbortSignal.timeout(120000),
      });
      const j = await res.json();
      return j.answer || j.error || 'Ответ не получен. Попробуйте отправить вопрос еще раз.';
    } catch (error) {
      if(error instanceof RequestLimitError)return error.message;
      return 'Не удалось связаться с сервисом. Проверьте подключение к интернету и отправьте вопрос еще раз.';
    }
  };

  const busy = phase === 'parsing' || phase === 'analyzing';

  return (
    <main className={`mx-auto max-w-6xl px-5 pt-12 ${phase === 'idle' ? 'flex min-h-[100svh] flex-col pb-8' : 'pb-24'}`}>
      <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Narrata</div>
            <div className="text-[11px] text-white/40">AI-дашборды с нарративом</div>
          </div>
        </div>
          <div className="flex flex-wrap items-center gap-2">
              <Button onClick={exportPdf} disabled={!canExport}
                title={phase !== 'ready' || !analysis ? 'Загрузите данные и дождитесь завершения анализа' : chatThinking ? 'Дождитесь ответа, чтобы включить его в отчет' : 'Скачать выводы, графики и полную историю чата'}>
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {exporting ? 'Готовим PDF…' : 'Скачать отчёт в PDF'}
              </Button>
            {(phase === 'ready' || phase === 'error') && (
            <Button variant="ghost" title="Загрузить другой файл или текст и начать новый анализ. Текущий отчет и история чата будут очищены" onClick={reset} disabled={exporting || chatThinking}><RotateCcw size={14} /> Новый датасет</Button>
            )}
          </div>
      </header>
      {exportError && <p role="alert" className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{exportError}</p>}

      <>
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h1 className="text-balance bg-gradient-to-br from-white to-white/60 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
                Узнайте, о чём говорят ваши данные.
              </h1>
              <p className="mt-4 text-white/50">
                Добавьте CSV, Excel или текстовый отчёт — получите главные выводы, наглядные графики и ответы на свои вопросы.
              </p>
            </div>
            <div className="mx-auto max-w-2xl">
              <Dropzone
                onFile={(f) => ingest(() => parseFile(f))}
                onText={(t) => ingest(() => datasetFromText(t))}
                busy={busy}
              />
            </div>
          </motion.div>
        )}

        {(phase === 'parsing' || phase === 'analyzing') && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <DashboardSkeleton phase={phase} />
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card role="alert" className="mx-auto max-w-xl p-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-lg font-medium">{errorTitle}</h2>
              <p className="mt-2 text-sm text-white/50">{error}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {dataset && <Button onClick={() => ingest(() => dataset)}>Повторить анализ</Button>}
                <Button onClick={reset}>Попробовать другой файл</Button>
              </div>
            </Card>
          </motion.div>
        )}

        {phase === 'ready' && dataset && analysis && (
          <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <NarrativeHero
              analysis={analysis}
              meta={{ name: dataset.name, rows: dataset.rows.length, source: dataset.source }}
            />
            <ChatPanel onAsk={askData} busy={busy || exporting} messages={messages} setMessages={setMessages}
              thinking={chatThinking} setThinking={setChatThinking} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {analysis.charts.map((c, i) => (
                <ChartCard key={i} spec={c} rows={dataset.rows} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </>
      {(phase === 'idle' || phase === 'ready') && (
        <footer className="mt-auto pt-12 text-center text-sm tracking-wide text-white/40">
          Загрузите. Исследуйте. Спрашивайте.
        </footer>
      )}
      {phase === 'ready' && (
        <button
          type="button"
          aria-label="Вернуться к началу страницы"
          title="Вернуться к началу страницы"
          onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}
          className="fixed bottom-6 right-6 z-30 grid h-12 w-12 place-items-center rounded-full border border-violet-300/25 bg-[#181323]/95 text-violet-200 shadow-lg shadow-black/25 backdrop-blur-xl transition-colors hover:border-violet-300/60 hover:bg-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#07070a]"
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
