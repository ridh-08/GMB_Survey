import { NextRequest, NextResponse } from 'next/server';
import { getRespondentByResponseId, upsertAnswer } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { responseId: string } }) {
  const body = await request.json();
  const { questionId, questionCode, value, comment } = body || {};

  if (!questionId || !questionCode) {
    return NextResponse.json({ error: 'Missing question data' }, { status: 400 });
  }

  const respondent = await getRespondentByResponseId(params.responseId);
  if (!respondent || respondent.status === 'completed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await upsertAnswer(respondent.id, String(questionId), String(questionCode), value, comment ? String(comment) : undefined);
  return NextResponse.json({ ok: true });
}
