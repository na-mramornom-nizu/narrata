export type Row = Record<string, string | number | null>;

export interface Dataset {
  rows: Row[];
  columns: string[];
  rawText?: string;
  source: 'file' | 'text';
  name: string;
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie';
export type Agg = 'count' | 'sum' | 'avg';

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  xKey?: string;
  yKey?: string | null;
  aggregation?: Agg;
  limit?: number;
  data?: { name: string; value: number }[];
}

export interface Insight {
  label: string;
  value: string;
  hint?: string;
}

export interface Analysis {
  headline: string;
  narrative: string;
  insights: Insight[];
  charts: ChartSpec[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}