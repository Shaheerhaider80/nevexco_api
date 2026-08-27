import { NextResponse } from 'next/server';
import { postXml, redactXml } from '@/lib/novexco-client';
import { parseProductDetail } from '@/lib/novexco-adapter';
import { buildProductsXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/**
 * Full data sheet for one product, fetched live.
 *
 * The local cache holds trimmed summaries only, so detail always comes from the
 * API - a single-code lookup is fast.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: 'Product code is required' }, { status: 400 });
  }

  const xml = buildProductsXml({ codes: [code], take: 1 });
  const raw = await postXml('products-request', xml);
  const parsed = parseProductDetail(raw.xml);

  if (parsed.fault) {
    return NextResponse.json(
      { fault: parsed.fault, ms: raw.ms, requestXml: redactXml(xml) },
      { status: 502 }
    );
  }
  if (!parsed.product) {
    return NextResponse.json(
      { error: `No product found for code ${code}`, ms: raw.ms },
      { status: 404 }
    );
  }

  return NextResponse.json({
    product: parsed.product,
    ms: raw.ms,
    requestXml: redactXml(xml),
    rawXml: redactXml(raw.xml),
  });
}
