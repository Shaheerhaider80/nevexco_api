/**
 * Novexco Ordering API client.
 *
 * The backend is SAP, fronted by Azure API Management. Every endpoint except
 * order creation expects a SOAP envelope wrapping an RFC function call; order
 * creation takes a bare SAP PI message instead. Both shapes are built here.
 *
 * Verified live against /qa — see lib/endpoints.ts for what is actually deployed.
 */

const SAP_NS = 'urn:sap-com:document:sap:rfc:functions';
const ORDER_NS = 'urn:Novexco.com:Orders:Inbound';

function config() {
  const baseUrl = process.env.NOVEXCO_BASE_URL;
  const apiKey = process.env.NOVEXCO_API_KEY;
  const customer = process.env.NOVEXCO_CUSTOMER;
  const password = process.env.NOVEXCO_PASSWORD;

  if (!baseUrl || !apiKey || !customer || !password) {
    throw new Error(
      'Missing Novexco credentials. Copy .env.example to .env.local and fill it in.'
    );
  }
  return { baseUrl, apiKey, customer, password };
}

/** Escape the five XML entities. Product codes and PO numbers are user-supplied. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap RFC-call body fields in the SOAP envelope SAP expects. */
export function soapEnvelope(rfcName: string, innerXml: string): string {
  const { customer, password } = config();
  return `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="${SAP_NS}">
  <soap-env:Body>
    <urn:${rfcName}>
      <CUSTOMER>${esc(customer)}</CUSTOMER>
      <PASSWORD>${esc(password)}</PASSWORD>
${innerXml}
    </urn:${rfcName}>
  </soap-env:Body>
</soap-env:Envelope>`;
}

/**
 * Order creation is the one endpoint that is NOT SOAP-wrapped — it posts a
 * bare SAP PI/PO message in the Novexco orders namespace.
 */
export function orderMessage(innerXml: string): string {
  const { customer, password } = config();
  return `<?xml version="1.0" encoding="UTF-8"?>
<ns0:MT_Z_PO xmlns:ns0="${ORDER_NS}">
  <CUSTOMER>${esc(customer)}</CUSTOMER>
  <PASSWORD>${esc(password)}</PASSWORD>
${innerXml}
</ns0:MT_Z_PO>`;
}

export interface RawResult {
  ok: boolean;
  status: number;
  xml: string;
  /** Milliseconds spent in the round trip — surfaced in the UI. */
  ms: number;
}

/**
 * POST an XML body to one Novexco endpoint path.
 *
 * Never throws on an HTTP error status: SAP returns meaningful SOAP faults with
 * 500, and the explorer UI needs to display those rather than swallow them.
 */
export async function postXml(
  path: string,
  body: string,
  contentType = 'text/xml'
): Promise<RawResult> {
  const { baseUrl, apiKey } = config();
  const started = Date.now();

  try {
    const res = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      body,
      // Catalog pages of 250 products take ~40s; SAP is not fast.
      signal: AbortSignal.timeout(180_000),
      cache: 'no-store',
    });

    return {
      ok: res.ok,
      status: res.status,
      xml: await res.text(),
      ms: Date.now() - started,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      xml: `<error>${esc(message)}</error>`,
      ms: Date.now() - started,
    };
  }
}

/** Build a repeating <item> list, e.g. LS_PRODUCTS / MATERIALS. */
export function itemList(
  wrapper: string,
  field: string,
  values: string[],
  indent = '      '
): string {
  if (!values.length) return `${indent}<${wrapper}/>`;
  const items = values
    .map((v) => `${indent}  <item><${field}>${esc(v)}</${field}></item>`)
    .join('\n');
  return `${indent}<${wrapper}>\n${items}\n${indent}</${wrapper}>`;
}
