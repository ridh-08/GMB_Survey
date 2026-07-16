import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-auth';
import { getRespondentWithAnswers } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { responseId: string } }) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const detail = await getRespondentWithAnswers(params.responseId);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(detail);
}
