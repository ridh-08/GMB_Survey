import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth';
import { getMergedCompanySheet } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const surveyId = request.nextUrl.searchParams.get('surveyId');
  if (!surveyId) {
    return NextResponse.json({ error: 'surveyId is required' }, { status: 400 });
  }

  const sheet = await getMergedCompanySheet(surveyId);
  return NextResponse.json(sheet);
}
