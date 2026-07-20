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
  // The response sheet still needs every row since it's built for CSV export,
  // but it's now backed by a single batched answers query instead of one
  // query per respondent, so it stays fast even at 200-300+ responses.
  const [{ respondents, total }, surveys, sheet] = await Promise.all([
    getAllRespondents(surveyId, page, pageSize),
    getActiveSurveys(),
    getAdminResponseSheet(surveyId),
  ]);
  return NextResponse.json({ respondents, total, page, pageSize, surveys, sheet });
}