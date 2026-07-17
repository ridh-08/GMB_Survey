import { NextRequest, NextResponse } from 'next/server';
import { completeSurvey, getRespondentByResponseId } from '@/lib/repository';
import { resumeCookieName } from '@/lib/resume-cookie';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { responseId: string } }) {
  const respondent = await getRespondentByResponseId(params.responseId);
  if (!respondent || respondent.status === 'completed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await completeSurvey(respondent.id);

  const response = NextResponse.json({ ok: true });
  // Nothing left to resume once the survey is submitted.
  response.cookies.set(resumeCookieName(respondent.survey_id), '', { path: '/', maxAge: 0 });
  return response;
}
