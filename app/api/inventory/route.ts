import { NextResponse } from 'next/server';
import { postXml, redactXml } from '@/lib/novexco-client';
import { parseInventory } from '@/lib/novexco-adapter';
import { buildInventoryXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/** Live stock across the five Canadian warehouses. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const codes: string[] = Array.isArray(body.codes) ? body.codes.filter(Boolean) : [];
  const warehouses: string[] = Array.isArray(body.warehouses)
    ? body.warehouses.filter(Boolean)
    : [];

  if (!codes.length) {
    return NextResponse.json({ error: 'codes[] is required' }, { status: 400 });
  }

  const xml = buildInventoryXml(codes, warehouses);
  const raw = await postXml('inventory-request', xml);
  const parsed = parseInventory(raw.xml);

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
