import { NextResponse } from 'next/server';
import { postXml, redactXml } from '@/lib/novexco-client';
import { parseOrderAck } from '@/lib/novexco-adapter';
import { buildOrderXml, type OrderInput } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/**
 * Order creation.
 *
 * Defaults to a dry run: the exact payload is returned but nothing is sent.
 * Submitting for real requires `confirm: true` in the body, so that clicking
 * around the explorer cannot create orders by accident.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = body.order as OrderInput | undefined;

  if (!input?.referenceNumber) {
    return NextResponse.json(
      { error: 'order.referenceNumber is required' },
      { status: 400 }
    );
  }

  const lines = (input.lines ?? []).filter((l) => l?.code && Number(l.quantity) > 0);
  if (!lines.length) {
    return NextResponse.json(
      { error: 'At least one order line with a code and quantity is required' },
      { status: 400 }
    );
  }

  const xml = buildOrderXml({ ...input, lines });

  if (body.confirm !== true) {
    return NextResponse.json({
      dryRun: true,
      requestXml: redactXml(xml),
      note: 'Nothing was sent. Set confirm: true to submit this order to Novexco.',
    });
  }

  const raw = await postXml('order-creation/', xml);
  const ack = parseOrderAck(raw.xml);

  return NextResponse.json({
    dryRun: false,
    // 202 Accepted means queued, not created - poll confirmation for the real
    // order number.
    accepted: raw.status === 202,
    status: raw.status,
    ms: raw.ms,
    ack,
    referenceNumber: input.referenceNumber,
    requestXml: redactXml(xml),
    rawXml: redactXml(raw.xml),
  });
}
