import { NextResponse } from 'next/server';
import { postXml } from '@/lib/novexco-client';
import { parseRecordList } from '@/lib/novexco-adapter';
import { buildInvoiceXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** Invoice retrieval with line items, fees, and Canadian tax breakdowns. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const xml = buildInvoiceXml(body);
  const raw = await postXml('invoice-request', xml);
  const parsed = parseRecordList(raw.xml);

  return NextResponse.json(
    { ...parsed, ms: raw.ms, status: raw.status, requestXml: xml, rawXml: raw.xml },
    { status: parsed.fault ? 502 : 200 }
  );
}
