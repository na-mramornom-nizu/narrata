import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/ai';
import type { ChatMessage, Dataset } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { dataset, messages } = (await req.json()) as { dataset: Dataset; messages: ChatMessage[] };
    const answer = await chat(dataset, messages);
    return NextResponse.json({ answer });
  } catch (e: any) {
    console.error('[chat]', e);
    return NextResponse.json({ error: e?.message || 'Ошибка чата' }, { status: 500 });
  }
}