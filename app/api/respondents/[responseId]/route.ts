import { NextRequest, NextResponse } from 'next/server';
import { getRespondentWithAnswers } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { responseId: string } }) {
  const detail = await getRespondentWithAnswers(params.responseId);
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(detail);
}
