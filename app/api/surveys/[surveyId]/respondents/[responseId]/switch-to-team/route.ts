import { NextRequest, NextResponse } from 'next/server';
import { getRespondentByResponseId, switchRespondentToTeamMode } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { responseId: string } }) {
  const body = await request.json().catch(() => ({}));
  const sectionScope: string[] = Array.isArray(body.sectionScope)
    ? body.sectionScope.filter((s: unknown) => typeof s === 'string')
    : [];

  const respondent = await getRespondentByResponseId(params.responseId);
  if (!respondent || respondent.status === 'completed') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (respondent.completion_mode === 'team') {
    return NextResponse.json({ error: 'This response is already in team mode.' }, { status: 400 });
  }

  const updated = await switchRespondentToTeamMode(respondent.id, respondent.survey_id, sectionScope);
  return NextResponse.json({ respondent: updated });
}