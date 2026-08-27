import { NextResponse } from 'next/server';
import { postXml, redactXml } from '@/lib/novexco-client';
import { parsePrice } from '@/lib/novexco-adapter';
import { buildPriceXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** Live pricing. Never cached - a stale price is a mis-sale. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes.filter(Boolean) : [];

  if (!codes.length) {
    return NextResponse.json({ error: 'codes[] is required' }, { status: 400 });
  }

  const xml = buildPriceXml(codes, body.language ?? 'EN');
  const raw = await postXml('GetPrice', xml);
  const parsed = parsePrice(raw.xml);

  return NextResponse.json(
    {
      ...parsed,
      ms: raw.ms,
      status: raw.status,
      requestXml: redactXml(xml),
      rawXml: redactXml(raw.xml),
    },
    { status: parsed.fault ? 502 : 200 }
  );
}
