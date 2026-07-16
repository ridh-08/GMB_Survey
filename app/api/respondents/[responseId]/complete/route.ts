import { NextRequest, NextResponse } from 'next/server';
import { completeSurvey, getRespondentByResponseId } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { responseId: string } }) {
  const respondent = await getRespondentByResponseId(params.responseId);
  if (!respondent || respondent.status === 'completed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await completeSurvey(respondent.id);
  return NextResponse.json({ ok: true });
}
