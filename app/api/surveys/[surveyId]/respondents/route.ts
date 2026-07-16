import { NextRequest, NextResponse } from 'next/server';
import { createRespondent } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { surveyId: string } }) {
  const body = await request.json().catch(() => ({}));
  const respondent = await createRespondent(params.surveyId, body.email ? String(body.email) : undefined);
  return NextResponse.json({ respondent });
}
