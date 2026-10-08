'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, AlertTriangle, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Dropzone } from '@/components/Dropzone';
import { NarrativeHero } from '@/components/NarrativeHero';
import { ChartCard } from '@/components/ChartCard';
import { ChatPanel } from '@/components/ChatPanel';
import { DashboardSkeleton } from '@/components/Skeletons';
import { Button, Card } from '@/components/ui';
import { parseFile, datasetFromText } from '@/lib/parse';
import type { Analysis, Dataset } from '@/lib/types';

type Phase = 'idle' | 'parsing' | 'analyzing' | 'ready' | 'error';

export default function Page() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setPhase('idle'); setDataset(null); setAnalysis(null); setError(null);
  };

  const ingest = async (fn: () => Promise<Dataset> | Dataset) => {
    setError(null); setPhase('parsing');
    try {
      const ds = await fn();
      setDataset(ds);
      setPhase('analyzing');
      const res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ds),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'AI-анализ не удался');
      }
      const a = (await res.json()) as Analysis;
      setAnalysis(a);
      setPhase('ready');
    } catch (e: any) {
      setError(e?.message || 'Что-то пошло не так');
      setPhase('error');
    }
  };

  const askData = async (q: string): Promise<string> => {
    if (!dataset) return 'Датасет не загружен.';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, messages: [{ role: 'user', content: q }] }),
      });
      const j = await res.json();
      return j.answer || j.error || 'Нет ответа.';
    } catch {
      return 'Ошибка сети — попробуйте ещё раз.';
    }
  };

  const busy = phase === 'parsing' || phase === 'analyzing';

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-12">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Narrata</div>
            <div className="text-[11px] text-white/40">AI-дашборды с нарративом</div>
          </div>
        </div>
        {(phase === 'ready' || phase === 'error') && (
          <Button variant="ghost" onClick={reset}><RotateCcw size={14} /> Новый датасет</Button>
        )}
      </header>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h1 className="bg-gradient-to-br from-white to-white/60 bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
                Загрузите данные.<br />Получите историю.
              </h1>
              <p className="mt-4 text-white/50">
                CSV, Excel или простой текстовый отчёт. Narrata превратит их в дашборд с нарративом, авто-подобранными графиками и честными ответами.
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
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DashboardSkeleton />
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mx-auto max-w-xl p-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300">
                <AlertTriangle size={20} />
              </div>
              <h2 className="text-lg font-medium">Что-то сломалось</h2>
              <p className="mt-2 text-sm text-white/50">{error}</p>
              <div className="mt-6 flex justify-center gap-2">
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {analysis.charts.map((c, i) => (
                <ChartCard key={i} spec={c} rows={dataset.rows} index={i} />
              ))}
            </div>
            <ChatPanel onAsk={askData} busy={busy} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}