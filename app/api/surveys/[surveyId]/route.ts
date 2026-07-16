import { NextRequest, NextResponse } from 'next/server';
import { getFullSurvey, getRespondentByResponseId, getAnswers } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { surveyId: string } }) {
  const survey = await getFullSurvey(params.surveyId);
  if (!survey) {
    return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
  }

  const responseId = request.nextUrl.searchParams.get('responseId');
  if (!responseId) {
    return NextResponse.json({ survey });
  }

  const respondent = await getRespondentByResponseId(responseId);
  if (!respondent || respondent.survey_id !== params.surveyId || respondent.status === 'completed') {
    return NextResponse.json({ survey });
  }

  const answers = await getAnswers(respondent.id);
  return NextResponse.json({ survey, respondent, answers });
}
