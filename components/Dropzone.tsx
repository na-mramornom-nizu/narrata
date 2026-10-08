'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, Sparkles, Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button, Card } from './ui';
import { cn } from '@/lib/utils';

interface Props {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  busy?: boolean;
}

export function Dropzone({ onFile, onText, busy }: Props) {
  const [tab, setTab] = useState<'file' | 'text'>('file');
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault(); setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <Card className="p-2 overflow-hidden">
      <div className="flex gap-1 p-1.5">
        {(['file', 'text'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t ? 'text-white' : 'text-white/50 hover:text-white/80',
            )}
          >
            {tab === t && (
              <motion.div
                layoutId="tabpill"
                className="absolute inset-0 rounded-2xl bg-white/[.08]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {t === 'file' ? <UploadCloud size={15} /> : <FileText size={15} />}
              {t === 'file' ? 'Загрузить файл' : 'Вставить текст'}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'file' ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative m-2 cursor-pointer rounded-3xl border border-dashed px-6 py-16 text-center transition-all',
              drag ? 'border-violet-400/70 bg-violet-500/[.08]' : 'border-white/10 hover:border-white/25 hover:bg-white/[.02]',
            )}
          >
            <input
              ref={inputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 border border-white/10">
              {busy ? <Loader2 className="animate-spin" size={22} /> : <UploadCloud size={22} />}
            </div>
            <p className="text-base font-medium">Перетащите CSV или Excel сюда</p>
            <p className="mt-1 text-sm text-white/40">или кликните для выбора · .csv, .xlsx, .xls</p>
          </motion.div>
        ) : (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="p-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Вставьте сырой недельный отчёт, тред из Slack или заметки со встречи…"
              rows={9}
              className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-sm placeholder-white/30 outline-none focus:border-violet-400/50 focus:ring-4 focus:ring-violet-500/10"
            />
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-white/40">{text.length.toLocaleString('ru-RU')} символов</span>
              <Button disabled={!text.trim() || busy} onClick={() => onText(text.trim())}>
                <Sparkles size={15} />
                {busy ? 'Анализируем…' : 'Анализировать'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}