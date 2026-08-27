/**
 * Parses Novexco SOAP responses into stable JSON shapes.
 *
 * Two SAP quirks drive most of the code here:
 *  - A repeating <item> list collapses to a single object when it has one entry,
 *    so every list must be normalised through arr().
 *  - Text fields are frequently padded with spaces ("       0.35"), so values
 *    are trimmed before use.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  // Product codes like "0012" must not be coerced into numbers.
  parseTagValue: false,
  parseAttributeValue: false,
});

/** SAP collapses single-element lists into a bare object. Always get an array. */
export function arr<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function num(value: unknown): number {
  const parsed = Number.parseFloat(str(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Strip namespace prefixes so n0:Foo and Foo are both reachable. */
function stripNs(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key.includes(':') ? key.split(':').pop()! : key] = value;
  }
  return out;
}

export interface SoapFault {
  faultcode: string;
  faultstring: string;
}

export interface ParsedEnvelope {
  fault: SoapFault | null;
  /** The Response element contents, namespace prefix removed. */
  payload: Record<string, unknown>;
}

/**
 * Unwrap a SOAP envelope. Returns the response payload, or the fault if SAP
 * rejected the call - callers surface faults rather than throwing.
 */
export function parseEnvelope(xml: string): ParsedEnvelope {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return {
      fault: { faultcode: 'ParseError', faultstring: 'Response was not valid XML' },
      payload: {},
    };
  }

  const root = stripNs(doc);

  // A transport failure recorded by the client, not a SOAP response.
  if (root.error) {
    return {
      fault: { faultcode: 'Transport', faultstring: str(root.error) },
      payload: {},
    };
  }

  const envelope = root.Envelope as Record<string, unknown> | undefined;
  if (!envelope) {
    // Order creation replies with a plain <response> document, not an envelope.
    return { fault: null, payload: root };
  }

  // The envelope's own children carry the namespace prefix too, so strip before
  // reaching for Body.
  const envelopeChildren = stripNs(envelope);
  const body = stripNs(
    (envelopeChildren.Body ?? {}) as Record<string, unknown>
  );

  if (body.Fault) {
    const fault = stripNs(body.Fault as Record<string, unknown>);
    return {
      fault: {
        faultcode: str(fault.faultcode) || 'Unknown',
        faultstring: str(fault.faultstring) || 'No detail supplied',
      },
      payload: {},
    };
  }

  // The single remaining child is the Response element.
  const responseKey = Object.keys(body)[0];
  if (!responseKey) return { fault: null, payload: {} };

  return {
    fault: null,
    payload: stripNs((body[responseKey] ?? {}) as Record<string, unknown>),
  };
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export interface CategoryRef {
  code: string;
  nameEn: string;
  nameFr: string;
}

export interface ProductSummary {
  code: string;
  nameEn: string;
  nameFr: string;
  brand: string;
  categoryCode: string;
  categoryEn: string;
  categoryFr: string;
  imageUrl: string;
  status: string;
}

export interface ProductDetail extends ProductSummary {
  internalCode: string;
  longEn: string;
  longFr: string;
  baseUom: string;
  images: string[];
  packaging: Array<{
    level: string;
    code: string;
    description: string;
    quantity: number;
    barcode: string;
  }>;
  ecoFees: Array<{ province: string; amount: number }>;
  supplierProductNumber: string;
}

/** Pick the description matching a language from the bilingual item list. */
function pickLang(items: unknown, lang: 'EN' | 'FR', field = 'DESCRIPTION'): string {
  for (const item of arr(items as Record<string, unknown>[])) {
    if (str(item?.LANGUE) === lang || str(item?.LANGUAGE) === lang) {
      return str(item?.[field]);
    }
  }
  return '';
}

function firstImage(images: unknown): string {
  const list = arr(images as Record<string, unknown>[])
    .map((img) => ({ url: str(img?.PRODUCTIMAGE), seq: num(img?.SEQUENCE) }))
    .filter((img) => img.url);

  if (!list.length) return '';
  list.sort((a, b) => a.seq - b.seq);
  return list[0].url;
}

function toSummary(item: Record<string, unknown>): ProductSummary {
  const category = arr(
    (item.CATEGORY as Record<string, unknown>)?.item as Record<string, unknown>[]
  );
  const brands = arr(
    (item.BRANDS as Record<string, unknown>)?.item as Record<string, unknown>[]
  );

  return {
    code: str(item.PRODUCT),
    nameEn: pickLang((item.DESCRIPTION as Record<string, unknown>)?.item, 'EN'),
    nameFr: pickLang((item.DESCRIPTION as Record<string, unknown>)?.item, 'FR'),
    brand: str(brands[0]?.BRAND),
    categoryCode: str(category[0]?.CODE),
    categoryEn: pickLang(category, 'EN'),
    categoryFr: pickLang(category, 'FR'),
    imageUrl: firstImage((item.IMAGES as Record<string, unknown>)?.item),
    status: str(item.PRODUCTSTATUS),
  };
}

export interface ProductsResult {
  fault: SoapFault | null;
  message: string;
  total: number;
  products: ProductSummary[];
}

export function parseProducts(xml: string): ProductsResult {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, message: '', total: 0, products: [] };

  const items = arr(
    (payload.RESPONSE as Record<string, unknown>)?.item as Record<string, unknown>[]
  );

  return {
    fault: null,
    message: str(payload.MESSAGE),
    total: num(payload.TOTAL),
    products: items.map(toSummary).filter((p) => p.code),
  };
}

const ECO_PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ONT', 'PE', 'QC', 'SK', 'YT',
];

function packagingLevel(item: unknown, level: string): ProductDetail['packaging'] {
  return arr(item as Record<string, unknown>[])
    .filter((p) => str(p?.LANGUAGE) === 'EN' && str(p?.CODE))
    .map((p) => ({
      level,
      code: str(p.CODE),
      description: str(p.DESCRIPTION),
      quantity: num(p.QUANTITY),
      barcode: str(p.BARCODE),
    }));
}

export function parseProductDetail(xml: string): {
  fault: SoapFault | null;
  product: ProductDetail | null;
} {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, product: null };

  const item = arr(
    (payload.RESPONSE as Record<string, unknown>)?.item as Record<string, unknown>[]
  )[0];
  if (!item) return { fault: null, product: null };

  const brands = arr(
    (item.BRANDS as Record<string, unknown>)?.item as Record<string, unknown>[]
  );
  const eco = (item.ECOFEES ?? {}) as Record<string, unknown>;

  const images = arr(
    (item.IMAGES as Record<string, unknown>)?.item as Record<string, unknown>[]
  )
    .map((img) => str(img?.PRODUCTIMAGE))
    .filter(Boolean);

  return {
    fault: null,
    product: {
      ...toSummary(item),
      internalCode: str(item.INTERNALPRODUCT),
      longEn: pickLang((item.DESCRIPTIONLONGUE as Record<string, unknown>)?.item, 'EN'),
      longFr: pickLang((item.DESCRIPTIONLONGUE as Record<string, unknown>)?.item, 'FR'),
      baseUom: str(item.BASEUNITPACKAGING),
      images: [...new Set(images)],
      packaging: [
        ...packagingLevel((item.UNITPACKAGING as Record<string, unknown>)?.item, 'Unit'),
        ...packagingLevel((item.BOXPACKAGING as Record<string, unknown>)?.item, 'Box'),
        ...packagingLevel((item.CASEPACKAGING as Record<string, unknown>)?.item, 'Case'),
        ...packagingLevel((item.PALLETPACKAGING as Record<string, unknown>)?.item, 'Pallet'),
      ],
      ecoFees: ECO_PROVINCES.map((province) => ({
        province,
        amount: num(eco[province]),
      })).filter((fee) => fee.amount > 0),
      supplierProductNumber: str(brands[0]?.SUPPLIERPRODUCTNUMBER),
    },
  };
}

/** Every distinct category carried by a page of products. */
export function extractCategories(products: ProductSummary[]): CategoryRef[] {
  const seen = new Map<string, CategoryRef>();
  for (const product of products) {
    if (!product.categoryCode || seen.has(product.categoryCode)) continue;
    seen.set(product.categoryCode, {
      code: product.categoryCode,
      nameEn: product.categoryEn,
      nameFr: product.categoryFr,
    });
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export interface PriceTier {
  material: string;
  scaleLevel: number;
  netPrice: number;
  currency: string;
  scaleUom: string;
  promoPrice: number;
  contractPrice: number;
  fees: Array<{ fee: string; region: string; amount: number; uom: string }>;
}

export interface PriceResult {
  fault: SoapFault | null;
  message: string;
  tiers: PriceTier[];
  errors: Array<{ material: string; error: string }>;
}

export function parsePrice(xml: string): PriceResult {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, message: '', tiers: [], errors: [] };

  const list = arr(
    (payload.RETURN_LIST as Record<string, unknown>)?.item as Record<string, unknown>[]
  );
  const errs = arr(
    (payload.RETURN_ERROR as Record<string, unknown>)?.item as Record<string, unknown>[]
  );

  return {
    fault: null,
    message: str(payload.MESSAGE),
    tiers: list.map((item) => ({
      material: str(item.MATERIAL),
      scaleLevel: num(item.SCALE_LEVEL),
      netPrice: num(item.NET_PRICE),
      currency: str(item.CURRENCY_KEY),
      scaleUom: str(item.SCALE_UOM),
      promoPrice: num(item.PROMO_PRICE),
      contractPrice: num(item.CONTRACT_PRICE),
      fees: arr(
        (item.FEES as Record<string, unknown>)?.item as Record<string, unknown>[]
      ).map((fee) => ({
        fee: str(fee.FEE),
        region: str(fee.REGION),
        amount: num(fee.AMOUNT),
        uom: str(fee.UOM),
      })),
    })),
    errors: errs
      .map((e) => ({ material: str(e.MATERIAL), error: str(e.ERROR) }))
      .filter((e) => e.material || e.error),
  };
}

/**
 * The price a customer actually pays: contract overrides promo, promo overrides
 * net. Both overrides use 0.0 to mean "not set".
 */
export function effectivePrice(tier: PriceTier): { amount: number; kind: string } {
  if (tier.contractPrice > 0) return { amount: tier.contractPrice, kind: 'Contract' };
  if (tier.promoPrice > 0) return { amount: tier.promoPrice, kind: 'Promo' };
  return { amount: tier.netPrice, kind: 'Net' };
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export interface InventoryRow {
  productCode: string;
  weight: number;
  productStatus: string;
  dropShip: boolean;
  warehouses: Array<{
    code: string;
    name: string;
    quantity: number;
    receivingDate: string;
  }>;
}

export function parseInventory(xml: string): {
  fault: SoapFault | null;
  message: string;
  total: number;
  rows: InventoryRow[];
} {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, message: '', total: 0, rows: [] };

  const items = arr(
    (payload.RESPONSE as Record<string, unknown>)?.item as Record<string, unknown>[]
  );

  return {
    fault: null,
    message: str(payload.MESSAGE),
    total: num(payload.TOTAL),
    rows: items.map((item) => ({
      productCode: str(item.PRODUCT_CODE),
      weight: num(item.WEIGHT),
      productStatus: str(item.PRODUCT_STATUS),
      dropShip: str(item.DROP).toUpperCase() === 'X',
      warehouses: arr(
        (item.WAREHOUSE as Record<string, unknown>)?.item as Record<string, unknown>[]
      ).map((wh) => ({
        code: str(wh.CODE),
        name: str(wh.NAME),
        quantity: num(wh.QUANTITY),
        receivingDate: str(wh.RECEIVINGDATE),
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Orders, tracking, invoices                                          */
/* ------------------------------------------------------------------ */

/** Rows are rendered generically by the explorer, so keep them loose. */
export type GenericRow = Record<string, string>;

/** Flatten one record to scalar fields; nested structures are summarised. */
function flatten(item: Record<string, unknown>): GenericRow {
  const row: GenericRow = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      const nested = value as Record<string, unknown>;
      if (nested.item) {
        row[key] = `${arr(nested.item as unknown[]).length} item(s)`;
      } else {
        const name = str(nested.NAME) || str(nested.CODE);
        if (name) row[key] = name;
      }
      continue;
    }
    row[key] = str(value);
  }
  return row;
}

export function parseRecordList(xml: string): {
  fault: SoapFault | null;
  message: string;
  total: number;
  rows: GenericRow[];
} {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, message: '', total: 0, rows: [] };

  const items = arr(
    (payload.RESPONSE as Record<string, unknown>)?.item as Record<string, unknown>[]
  );

  return {
    fault: null,
    message: str(payload.MESSAGE),
    total: num(payload.TOTAL),
    rows: items.map(flatten),
  };
}

/** Order creation answers with a plain <response> document, not an envelope. */
export function parseOrderAck(xml: string): {
  fault: SoapFault | null;
  status: string;
  message: string;
} {
  const { fault, payload } = parseEnvelope(xml);
  if (fault) return { fault, status: '', message: '' };

  const response = (payload.response ?? payload) as Record<string, unknown>;
  return {
    fault: null,
    status: str(response.status),
    message: str(response.message),
  };
}
