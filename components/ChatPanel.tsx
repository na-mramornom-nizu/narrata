'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Loader2, MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ChatMessage } from '@/lib/types';
import { Card } from './ui';

export function ChatPanel({
  onAsk, busy, messages, setMessages, thinking, setThinking,
}: {
  onAsk: (messages: ChatMessage[]) => Promise<string>;
  busy: boolean;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  thinking: boolean;
  setThinking: Dispatch<SetStateAction<boolean>>;
}) {
  const [input, setInput] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const pending = useRef(false);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const submit = async () => {
    const q = input.trim();
    if (!q || pending.current || busy) return;
    pending.current = true;
    setInput('');
    const history: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(history);
    setThinking(true);
    try {
      const answer = await onAsk(history);
      setMessages((m) => [...m, { role: 'assistant', content: answer }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Не удалось получить ответ. Попробуйте ещё раз.' }]);
    } finally {
      pending.current = false;
      setThinking(false);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-5 py-3 text-sm text-white/70">
        <MessagesSquare size={15} className="text-violet-300" />
        Спросите данные
        <span className="ml-auto text-[11px] text-white/30">ответы строго по вашему файлу</span>
      </div>

      {messages.length > 0 && (
        <div ref={boxRef} className="max-h-72 space-y-3 overflow-y-auto px-5 py-4">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={
                  'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ' +
                  (m.role === 'user'
                    ? 'bg-gradient-to-br from-violet-500/90 to-fuchsia-500/80 text-white'
                    : 'border border-white/[.08] bg-white/[.04] text-white/85')
                }>
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {thinking && (
            <div className="flex items-center gap-2 text-xs text-white/40">
              <Loader2 size={12} className="animate-spin" /> думаю…
            </div>
          )}
        </div>
      )}

      <div className="border-t border-white/[.06] p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 focus-within:border-violet-400/50 focus-within:ring-4 focus-within:ring-violet-500/10 transition-all">
          <input
            aria-label="Вопрос по данным"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
            placeholder="Спросите что-нибудь про эти данные…"
            className="flex-1 bg-transparent text-sm placeholder-white/30 outline-none"
          />
          <button
            aria-label="Отправить сообщение"
            onClick={submit}
            disabled={!input.trim() || thinking || busy}
            className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white disabled:opacity-30 transition-transform active:scale-95"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </Card>
  );
}
