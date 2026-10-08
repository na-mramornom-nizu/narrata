import { NextRequest, NextResponse } from 'next/server';
import { analyze } from '@/lib/ai';
import type { Dataset } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const dataset = (await req.json()) as Dataset;
    if (!dataset || (!dataset.rows?.length && !dataset.rawText)) {
      return NextResponse.json({ error: 'Пустой датасет' }, { status: 400 });
    }
    const analysis = await analyze(dataset);
    return NextResponse.json(analysis);
  } catch (e: any) {
    console.error('[analyze]', e);
    return NextResponse.json({ error: e?.message || 'Ошибка анализа' }, { status: 500 });
  }
}