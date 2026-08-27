import { NextResponse } from 'next/server';
import { postXml } from '@/lib/novexco-client';
import { parseRecordList } from '@/lib/novexco-adapter';
import { buildOrderSearchXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** Order search. PERIOD is required by this endpoint, unlike the others. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const period = body.period;

  if (!period?.startDate || !period?.endDate) {
    return NextResponse.json(
      { error: 'period.startDate and period.endDate are required by this endpoint' },
      { status: 400 }
    );
  }

  const xml = buildOrderSearchXml({ ...body, period });
  // This endpoint is documented with application/xml, unlike its siblings.
  const raw = await postXml('order-request', xml, 'application/xml');
  const parsed = parseRecordList(raw.xml);

  return NextResponse.json(
    { ...parsed, ms: raw.ms, status: raw.status, requestXml: xml, rawXml: raw.xml },
    { status: parsed.fault ? 502 : 200 }
  );
}
