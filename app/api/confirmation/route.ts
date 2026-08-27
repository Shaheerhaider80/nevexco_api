import { NextResponse } from 'next/server';
import { postXml, redactXml } from '@/lib/novexco-client';
import { parseRecordList } from '@/lib/novexco-adapter';
import { buildConfirmationXml } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/**
 * Order confirmation. The field is REFNUMBER here, matching the
 * REFERENCENUMBER sent at creation. An empty result means "not processed yet".
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const refNumber: string = body.refNumber ?? '';
  const period = body.period;

  if (!refNumber && !(period?.startDate && period?.endDate)) {
    return NextResponse.json(
      { error: 'Supply refNumber, or a period with startDate and endDate' },
      { status: 400 }
    );
  }

  const xml = buildConfirmationXml(refNumber, period, body.language ?? 'EN');
  const raw = await postXml('confirmation-request', xml);
  const parsed = parseRecordList(raw.xml);

  return NextResponse.json(
    {
      ...parsed,
      pending: !parsed.fault && parsed.rows.length === 0,
      ms: raw.ms,
      status: raw.status,
      requestXml: redactXml(xml),
      rawXml: redactXml(raw.xml),
    },
    { status: parsed.fault ? 502 : 200 }
  );
}
