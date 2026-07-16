import { NextRequest, NextResponse } from 'next/server';
import { getRespondentByResponseId, updateRespondentProgress } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { responseId: string } }) {
  const body = await request.json();
  const sectionIndex = Number(body?.sectionIndex ?? 0);
  const questionIndex = Number(body?.questionIndex ?? 0);

  const respondent = await getRespondentByResponseId(params.responseId);
  if (!respondent || respondent.status === 'completed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await updateRespondentProgress(respondent.id, sectionIndex, questionIndex);
  return NextResponse.json({ ok: true });
}
