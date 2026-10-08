import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const CHART_PALETTE = [
  '#8B5CF6', '#22D3EE', '#E879F9', '#34D399', '#FBBF24', '#F472B6', '#60A5FA',
];

export const fmtNum = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('ru-RU') : n.toFixed(2);