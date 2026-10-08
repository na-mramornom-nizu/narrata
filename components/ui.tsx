import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('glass rounded-3xl', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export function Button({
  className, variant = 'primary', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_8px_30px_-8px_rgba(139,92,246,.8)] hover:brightness-110 active:scale-[.98]'
          : 'glass hover:bg-white/[.08]',
        className,
      )}
      {...props}
    />
  );
}