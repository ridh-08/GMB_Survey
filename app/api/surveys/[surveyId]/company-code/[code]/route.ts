import { NextRequest, NextResponse } from 'next/server';
import { getCompanyGroupStatus } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { surveyId: string; code: string } }) {
  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const group = await getCompanyGroupStatus(params.surveyId, code);
  if (!group) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }
  return NextResponse.json({ valid: true, ...group });
}
