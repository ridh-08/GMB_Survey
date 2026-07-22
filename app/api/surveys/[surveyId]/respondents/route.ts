import { NextRequest, NextResponse } from 'next/server';
import { createRespondent, getSurveyById } from '@/lib/repository';
import { resumeCookieName, RESUME_COOKIE_MAX_AGE } from '@/lib/resume-cookie';
import type { CompletionMode } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { surveyId: string } }) {
  const body = await request.json().catch(() => ({}));

  const survey = await getSurveyById(params.surveyId);
  if (!survey) {
    return NextResponse.json({ error: 'Survey not found.' }, { status: 404 });
  }

  // Company name / job title / team-splitting only apply to the employer
  // survey — a single employer response may be split across several
  // colleagues (HR, Ops, CTO), so we need something to link their submissions
  // together. The employee survey has no such linking need, and already asks
  // about the respondent's role and company later in its own questions, so
  // collecting it again at signup would just be redundant.
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
  const completionMode: CompletionMode = survey.type === 'employer' && body.mode === 'team' ? 'team' : 'solo';
  const companyCode = typeof body.companyCode === 'string' && body.companyCode.trim() ? body.companyCode.trim().toUpperCase() : null;
  const sectionScope: string[] | null = Array.isArray(body.sectionScope) ? body.sectionScope.filter((s: unknown) => typeof s === 'string') : null;

  if (survey.type === 'employer' && (!companyName || !jobTitle)) {
    return NextResponse.json({ error: 'Company name and job title are required.' }, { status: 400 });
  }
  if (completionMode === 'team' && (!sectionScope || sectionScope.length === 0)) {
    return NextResponse.json({ error: 'Please select at least one section you are responsible for.' }, { status: 400 });
  }

  let respondent;
  try {
    respondent = await createRespondent(params.surveyId, {
      email: body.email ? String(body.email) : undefined,
      companyName: companyName || null,
      jobTitle: jobTitle || null,
      completionMode,
      companyCode,
      sectionScope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create respondent.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

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
