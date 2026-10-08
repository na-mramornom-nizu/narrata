import { serviceError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/ai';
import { isChatHistory, isDataset } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !isDataset(body.dataset) || !isChatHistory(body.messages)) {
      return NextResponse.json({ error: 'Нужны корректный датасет и история чата, заканчивающаяся вопросом пользователя.' }, { status: 400 });
    }
    const { dataset, messages } = body;
    const answer = await chat(dataset, messages);
    return NextResponse.json({ answer });
  } catch (e: any) {
    console.error('[chat]', e);
    const failure = serviceError(e, 'chat');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
