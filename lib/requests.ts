/**
 * Request body builders, one per deployed endpoint.
 *
 * Kept separate from the routes so the explorer UI can render the exact XML it
 * would send without performing the call - which is what makes the order
 * dry-run possible.
 */

import { esc, itemList, orderMessage, soapEnvelope } from './novexco-client';

export interface ProductsQuery {
  skip?: number;
  take?: number;
  codes?: string[];
  language?: string;
}

export function buildProductsXml(query: ProductsQuery = {}): string {
  const { skip = 0, take = 250, codes = [], language = 'EN' } = query;
  const lines = [
    '      <SOLDTO/>',
    `      <LANGUAGE>${esc(language)}</LANGUAGE>`,
    `      <SKIP>${Math.max(0, Math.trunc(skip))}</SKIP>`,
    // 250 is the documented cap; larger values are silently capped with a warning.
    `      <TAKE>${Math.min(250, Math.max(1, Math.trunc(take)))}</TAKE>`,
  ];
  // Omitting LS_PRODUCTS entirely returns the whole assortment.
  if (codes.length) lines.push(itemList('LS_PRODUCTS', 'CODE', codes));
  return soapEnvelope('Z_SD_PRODUCTS_RFC', lines.join('\n'));
}

export function buildPriceXml(codes: string[], language = 'EN'): string {
  return soapEnvelope(
    'Z_SD_PRICE',
    [
      `      <LANGUAGE>${esc(language)}</LANGUAGE>`,
      '      <SOLDTO/>',
      itemList('MATERIALS', 'MATERIAL_NUMBER', codes),
    ].join('\n')
  );
}

/** All five Canadian warehouses, used when the caller does not narrow the list. */
export const ALL_WAREHOUSES = ['2911', '2913', '2914', '2915', '2916'];

export function buildInventoryXml(codes: string[], warehouses: string[] = []): string {
  // Sending an empty LS_WAREHOUSES returns an empty <WAREHOUSE/> rather than
  // every warehouse, so the full list is sent explicitly by default.
  const targets = warehouses.length ? warehouses : ALL_WAREHOUSES;

  return soapEnvelope(
    'Z_SD_INVENTORY_RFC',
    [
      '      <SOLDTO/>',
      itemList('LS_PRODUCTS', 'CODE', codes),
      itemList('LS_WAREHOUSES', 'CODE', targets),
      '      <SKIP>0</SKIP>',
      `      <TAKE>${Math.max(1, codes.length || 10)}</TAKE>`,
    ].join('\n')
  );
}

export interface OrderLine {
  code: string;
  quantity: number;
}

export interface OrderInput {
  referenceNumber: string;
  purchaseOrder?: string;
  note?: string;
  requiredDate?: string;
  warehouse?: string;
  specialInstruction?: string;
  language?: string;
  lines: OrderLine[];
}

export function buildOrderXml(input: OrderInput): string {
  const parts: string[] = [
    `  <REFERENCENUMBER>${esc(input.referenceNumber)}</REFERENCENUMBER>`,
  ];

  if (input.purchaseOrder) {
    parts.push(`  <PURCHASEORDER>${esc(input.purchaseOrder)}</PURCHASEORDER>`);
  }
  if (input.requiredDate) {
    parts.push(`  <REQUIREDDATE>${esc(input.requiredDate)}</REQUIREDDATE>`);
  }
  if (input.warehouse) {
    parts.push(`  <WAREHOUSE>${esc(input.warehouse)}</WAREHOUSE>`);
  }
  if (input.specialInstruction) {
    parts.push(
      `  <SPECIALINSTRUCTION>${esc(input.specialInstruction)}</SPECIALINSTRUCTION>`
    );
  }
  if (input.note) parts.push(`  <NOTE>${esc(input.note)}</NOTE>`);
  parts.push(`  <LANGUAGE>${esc(input.language ?? 'EN')}</LANGUAGE>`);

  const items = input.lines
    .filter((line) => line.code && line.quantity > 0)
    .map(
      (line) =>
        `    <item>\n      <CODE>${esc(line.code)}</CODE>\n` +
        `      <QUANTITY>${Math.trunc(line.quantity)}</QUANTITY>\n    </item>`
    )
    .join('\n');

  parts.push(`  <PRODUCTS>\n${items}\n  </PRODUCTS>`);
  return orderMessage(parts.join('\n'));
}

export interface Period {
  startDate: string;
  endDate: string;
}

export function buildConfirmationXml(
  refNumber: string,
  period?: Period,
  language = 'EN'
): string {
  const lines: string[] = [];
  if (refNumber) lines.push(`      <REFNUMBER>${esc(refNumber)}</REFNUMBER>`);
  if (period?.startDate && period?.endDate) {
    lines.push(
      `      <PERIOD>\n        <STARTDATE>${esc(period.startDate)}</STARTDATE>\n` +
        `        <ENDDATE>${esc(period.endDate)}</ENDDATE>\n      </PERIOD>`
    );
  }
  lines.push(`      <LANGUAGE>${esc(language)}</LANGUAGE>`);
  return soapEnvelope('Z_SD_CONFIRMATION_RFC', lines.join('\n'));
}

export interface OrderSearchInput {
  period: Period;
  document?: string;
  refNumber?: string;
  customerPoNumber?: string;
  skip?: number;
  take?: number;
  language?: string;
}

export function buildOrderSearchXml(input: OrderSearchInput): string {
  // PERIOD is required for this endpoint, unlike the other search calls.
  const lines: string[] = [
    `      <PERIOD>\n        <STARTDATE>${esc(input.period.startDate)}</STARTDATE>\n` +
      `        <ENDDATE>${esc(input.period.endDate)}</ENDDATE>\n      </PERIOD>`,
  ];

  if (input.document) lines.push(`      <DOCUMENT>${esc(input.document)}</DOCUMENT>`);
  if (input.refNumber) lines.push(`      <REFNUMBER>${esc(input.refNumber)}</REFNUMBER>`);
  if (input.customerPoNumber) {
    lines.push(
      `      <CUSTOMERPONUMBER>${esc(input.customerPoNumber)}</CUSTOMERPONUMBER>`
    );
  }

  lines.push(`      <LANGUAGE>${esc(input.language ?? 'EN')}</LANGUAGE>`);
  lines.push(`      <SKIP>${Math.max(0, Math.trunc(input.skip ?? 0))}</SKIP>`);
  lines.push(`      <TAKE>${Math.max(1, Math.trunc(input.take ?? 25))}</TAKE>`);

  return soapEnvelope('Z_SD_ORDER_REQUEST_RFC', lines.join('\n'));
}

export interface TrackingInput {
  refNumber?: string;
  orderNo?: string;
  deliveryNo?: string;
  invoiceNo?: string;
  trackingNumber?: string;
  period?: Period;
  language?: string;
  take?: number;
}

export function buildTrackingXml(input: TrackingInput): string {
  const lines: string[] = [];
  if (input.refNumber) lines.push(`      <REFNUMBER>${esc(input.refNumber)}</REFNUMBER>`);
  if (input.orderNo) lines.push(`      <ORDERNO>${esc(input.orderNo)}</ORDERNO>`);
  if (input.deliveryNo) lines.push(`      <DELIVERYNO>${esc(input.deliveryNo)}</DELIVERYNO>`);
  if (input.invoiceNo) lines.push(`      <INVOICENO>${esc(input.invoiceNo)}</INVOICENO>`);
  if (input.trackingNumber) {
    lines.push(`      <TRACKINGNUMBER>${esc(input.trackingNumber)}</TRACKINGNUMBER>`);
  }
  if (input.period?.startDate && input.period?.endDate) {
    lines.push(
      `      <PERIOD>\n        <STARTDATE>${esc(input.period.startDate)}</STARTDATE>\n` +
        `        <ENDDATE>${esc(input.period.endDate)}</ENDDATE>\n      </PERIOD>`
    );
  }
  lines.push(`      <LANGUAGE>${esc(input.language ?? 'EN')}</LANGUAGE>`);
  lines.push(`      <TAKE>${Math.max(1, Math.trunc(input.take ?? 25))}</TAKE>`);
  return soapEnvelope('Z_SD_TRACKING_RFC', lines.join('\n'));
}

export interface InvoiceInput {
  invoiceNo?: string;
  orderNumber?: string;
  deliveryNo?: string;
  refNumber?: string;
  period?: Period;
  language?: string;
  skip?: number;
  take?: number;
}

export function buildInvoiceXml(input: InvoiceInput): string {
  const lines: string[] = [];
  if (input.invoiceNo) lines.push(`      <INVOICENO>${esc(input.invoiceNo)}</INVOICENO>`);
  if (input.orderNumber) {
    lines.push(`      <ORDERNUMBER>${esc(input.orderNumber)}</ORDERNUMBER>`);
  }
  if (input.deliveryNo) lines.push(`      <DELIVERYNO>${esc(input.deliveryNo)}</DELIVERYNO>`);
  if (input.refNumber) lines.push(`      <REFNUMBER>${esc(input.refNumber)}</REFNUMBER>`);
  if (input.period?.startDate && input.period?.endDate) {
    lines.push(
      `      <PERIOD>\n        <STARTDATE>${esc(input.period.startDate)}</STARTDATE>\n` +
        `        <ENDDATE>${esc(input.period.endDate)}</ENDDATE>\n      </PERIOD>`
    );
  }
  lines.push(`      <LANGUAGE>${esc(input.language ?? 'EN')}</LANGUAGE>`);
  lines.push(`      <SKIP>${Math.max(0, Math.trunc(input.skip ?? 0))}</SKIP>`);
  // Documented maximum for this endpoint is 250 records per request.
  lines.push(`      <TAKE>${Math.min(250, Math.max(1, Math.trunc(input.take ?? 25)))}</TAKE>`);
  return soapEnvelope('Z_SD_INVOICE_RFC', lines.join('\n'));
}
