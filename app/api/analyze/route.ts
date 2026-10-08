import { serviceError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { analyze } from '@/lib/ai';
import { isDataset } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const dataset = await req.json().catch(() => null);
    if (!isDataset(dataset)) {
      return NextResponse.json({ error: 'В загруженных данных нет таблицы или текста для анализа. Проверьте файл и загрузите его снова.' }, { status: 400 });
    }
    const analysis = await analyze(dataset);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error('[analyze]', e);
    const failure = serviceError(e, 'analysis');
    const retryable = failure.status === 502 || failure.status === 504 || /429|rate.?limit/i.test(e instanceof Error ? e.message : '');
    return NextResponse.json({ error: failure.error, retryable }, { status: failure.status });
  }
}
