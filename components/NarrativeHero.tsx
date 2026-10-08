'use client';
import { motion } from 'framer-motion';
import { Sparkles, Database } from 'lucide-react';
import type { Analysis, Insight } from '@/lib/types';
import { Card } from './ui';

export function NarrativeHero({
  analysis, meta,
}: { analysis: Analysis; meta: { name: string; rows: number; source: string } }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <Card className="relative overflow-hidden p-8 md:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-xs text-white/70">
            <Sparkles size={13} className="text-violet-300" />
            AI-нарратив
            <span className="text-white/20">•</span>
            <Database size={12} className="text-cyan-300" />
            {meta.name}
            {meta.rows > 0 && <span className="text-white/40"> · {meta.rows.toLocaleString('ru-RU')} строк</span>}
          </div>

          <h1 className="max-w-3xl bg-gradient-to-br from-white via-white to-white/60 bg-clip-text text-3xl font-semibold leading-tight text-transparent md:text-[40px] md:leading-[1.1]">
            {analysis.headline}
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-white/60">
            {analysis.narrative}
          </p>

          {analysis.insights?.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {analysis.insights.map((k, i) => <InsightCard key={i} insight={k} delay={i * 0.06} />)}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function InsightCard({ insight, delay }: { insight: Insight; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }}
      className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4 transition-colors hover:bg-white/[.06]"
    >
      <div className="text-[11px] uppercase tracking-wider text-white/40">{insight.label}</div>
      <div className="mt-1 bg-gradient-to-r from-white to-white/70 bg-clip-text text-2xl font-semibold text-transparent">
        {insight.value}
      </div>
      {insight.hint && <div className="mt-1 text-xs text-white/40">{insight.hint}</div>}
    </motion.div>
  );
}