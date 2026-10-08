import { Sparkles, Check, FileText } from 'lucide-react';

export function Shimmer({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-2xl ${className}`} />;
}

export function DashboardSkeleton({ phase }: { phase: 'parsing' | 'analyzing' }) {
  const analyzing = phase === 'analyzing';
  return (
    <div className="space-y-5 motion-safe:animate-fadeUp" aria-busy="true">
      <section className="glass relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/15 blur-3xl" />
        <div aria-hidden="true" className="relative mx-auto mb-7 flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-violet-300/15" />
          <div className="absolute inset-0 rounded-full border border-transparent border-t-violet-300 border-r-fuchsia-300/50 motion-safe:animate-spin" />
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-violet-400/10">
            <Sparkles className="h-6 w-6 text-violet-200 motion-safe:animate-pulse" />
          </div>
        </div>
        <div role="status" aria-live="polite" aria-atomic="true" className="relative">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-violet-300">{analyzing ? 'Анализируем данные' : 'Подготавливаем данные'}</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{analyzing ? 'Ваша история уже складывается' : 'Знакомимся с вашими данными'}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-white/55">
            {analyzing ? 'Ищем главное, подбираем графики и проверяем выводы по вашим данным. Отчёт появится, когда будет готов.' : 'Читаем содержимое и подготавливаем его для анализа. Скоро здесь появятся выводы и графики.'}
          </p>
        </div>
        <div aria-hidden="true" className="relative mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-3 text-xs text-white/50">
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
            {analyzing ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <FileText className="h-3.5 w-3.5" />}
            {analyzing ? 'Данные прочитаны' : 'Читаем данные'}
          </span>
        </div>
      </section>
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="glass rounded-3xl p-6">
            <Shimmer className="mb-3 h-3 w-1/3" />
            <Shimmer className="mb-6 h-2 w-1/2" />
            <div className="flex h-20 items-end gap-3 border-b border-white/5">
              {(i === 0 ? [35, 65, 45, 85, 60, 100] : [85, 55, 75, 40, 65, 30]).map((height, index) => (
                <div key={index} className="shimmer flex-1 rounded-t-lg" style={{ height: `${height}%`, animationDelay: `${index * 120}ms` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
