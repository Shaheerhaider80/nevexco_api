import { NextResponse } from 'next/server';
import { postXml } from '@/lib/novexco-client';
import { parseRecordList } from '@/lib/novexco-adapter';
import { buildTrackingXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** Shipment tracking. All filters are optional; use whichever you have. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const xml = buildTrackingXml(body);
  const raw = await postXml('tracking-request', xml);
  const parsed = parseRecordList(raw.xml);

  return NextResponse.json(
    { ...parsed, ms: raw.ms, status: raw.status, requestXml: xml, rawXml: raw.xml },
    { status: parsed.fault ? 502 : 200 }
  );
}
