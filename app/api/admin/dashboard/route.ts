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
  const page = Number(request.nextUrl.searchParams.get('page') || '1') || 1;
  const pageSize = Number(request.nextUrl.searchParams.get('pageSize') || '50') || 50;

  // The top table is paginated (only one page of respondents per request).
  const [respondents, surveys] = await Promise.all([
    getAllRespondents(surveyId),
    getActiveSurveys(),
  ]);

  // The dashboard keys its Response Sheet view by survey ID (one CSV export
  // per survey), so build a { [surveyId]: { columns, rows } } map — one
  // sheet per active survey — rather than a single flat sheet.
  const sheetEntries = await Promise.all(
    surveys.map(async (survey) => [survey.id, await getAdminResponseSheet(survey.id)] as const)
  );
  const sheet = Object.fromEntries(sheetEntries);

  const total = respondents.length;
  return NextResponse.json({ respondents, total, page, pageSize, surveys, sheet });
}