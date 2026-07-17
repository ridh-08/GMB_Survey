import { NextRequest, NextResponse } from 'next/server';
import { createRespondent } from '@/lib/repository';
import { resumeCookieName, RESUME_COOKIE_MAX_AGE } from '@/lib/resume-cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { surveyId: string } }) {
  const body = await request.json().catch(() => ({}));
  const respondent = await createRespondent(params.surveyId, body.email ? String(body.email) : undefined);

  const response = NextResponse.json({ respondent });
  // Identify this browser to this survey's in-progress response via a cookie
  // instead of a client-supplied response ID, so returning respondents are
  // resumed automatically without typing anything in.
  response.cookies.set(resumeCookieName(params.surveyId), respondent.response_id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: RESUME_COOKIE_MAX_AGE,
  });
  return response;
}
