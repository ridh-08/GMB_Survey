import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth';
import { getActiveSurveys, getAllRespondents, getAdminResponseSheet } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const surveyId = request.nextUrl.searchParams.get('surveyId') || undefined;
  const [respondents, surveys, sheet] = await Promise.all([
    getAllRespondents(surveyId),
    getActiveSurveys(),
    getAdminResponseSheet(surveyId),
  ]);
  return NextResponse.json({ respondents, surveys, sheet });
}
