/**
 * Plain-English presentation helpers.
 *
 * Novexco returns SAP field names (REFNUMBER, CREATIONDATE, NETVALUE...) and SAP
 * date formats. Nothing here changes what is fetched — it only decides how a
 * value is worded for someone who has never seen the API.
 */

/** SAP field name -> the wording a customer would use. */
const FIELD_LABELS: Record<string, string> = {
  // Identity
  REFNUMBER: 'Your reference',
  REFERENCENUMBER: 'Your reference',
  ORDERNO: 'Order number',
  ORDERNUMBER: 'Order number',
  DOCUMENT: 'Order number',
  DOCUMENTNO: 'Order number',
  SALESORDER: 'Order number',
  CUSTOMERPONUMBER: 'Your PO number',
  PURCHASEORDER: 'Your PO number',
  PONUMBER: 'Your PO number',
  DELIVERYNO: 'Delivery number',
  DELIVERYNUMBER: 'Delivery number',
  INVOICENO: 'Invoice number',
  INVOICENUMBER: 'Invoice number',
  CUSTOMER: 'Account',
  SOLDTO: 'Account',

  // Dates
  DATE: 'Date',
  CREATIONDATE: 'Date placed',
  ORDERDATE: 'Date placed',
  DOCUMENTDATE: 'Date placed',
  DELIVERYDATE: 'Delivery date',
  REQUIREDDATE: 'Requested for',
  SHIPPINGDATE: 'Shipped on',
  SHIPDATE: 'Shipped on',
  INVOICEDATE: 'Invoice date',
  DUEDATE: 'Payment due',
  RECEIVINGDATE: 'Next delivery to us',
  ESTIMATEDDELIVERY: 'Estimated arrival',

  // Status
  STATUS: 'Status',
  ORDERSTATUS: 'Status',
  DELIVERYSTATUS: 'Delivery status',
  PRODUCTSTATUS: 'Availability',
  MESSAGE: 'Details',

  // Products
  PRODUCT: 'Item code',
  PRODUCTCODE: 'Item code',
  PRODUCT_CODE: 'Item code',
  CODE: 'Item code',
  MATERIAL: 'Item code',
  MATERIAL_NUMBER: 'Item code',
  DESCRIPTION: 'Item',
  PRODUCTS: 'Items',
  QUANTITY: 'Quantity',
  QTY: 'Quantity',
  QUANTITYORDERED: 'Quantity ordered',
  QUANTITYSHIPPED: 'Quantity shipped',
  QUANTITYBACKORDER: 'On back order',
  UOM: 'Sold by',
  UNIT: 'Sold by',

  // Money
  PRICE: 'Price',
  UNITPRICE: 'Unit price',
  NETPRICE: 'Price',
  NET_PRICE: 'Price',
  NETVALUE: 'Subtotal',
  AMOUNT: 'Amount',
  TOTAL: 'Total',
  TOTALAMOUNT: 'Total',
  GRANDTOTAL: 'Total',
  CURRENCY: 'Currency',
  CURRENCY_KEY: 'Currency',
  TAX: 'Tax',
  TAXAMOUNT: 'Tax',
  GST: 'GST',
  PST: 'PST',
  QST: 'QST',
  HST: 'HST',
  FREIGHT: 'Shipping',
  DISCOUNT: 'Discount',

  // Shipping
  CARRIER: 'Carrier',
  SHIPPINGMETHOD: 'Shipping method',
  TRACKINGNUMBER: 'Tracking number',
  TRACKINGURL: 'Tracking link',
  WAREHOUSE: 'Ships from',
  PLANT: 'Ships from',
  SHIPTO: 'Delivery address',
  ADDRESS: 'Address',
  CITY: 'City',
  PROVINCE: 'Province',
  POSTALCODE: 'Postal code',
  WEIGHT: 'Weight',
};

/** Fields that repeat the account or language on every row — never worth showing. */
const HIDDEN_FIELDS = new Set([
  'LANGUAGE',
  'LANGUE',
  'CUSTOMER',
  'SOLDTO',
  'CLIENT',
  'MANDT',
]);

/**
 * A human label for a returned field. Anything not in the dictionary is
 * prettified rather than shown raw, so an unexpected field still reads as
 * English instead of leaking a SAP name.
 */
export function fieldLabel(key: string): string {
  const upper = key.toUpperCase();
  if (FIELD_LABELS[upper]) return FIELD_LABELS[upper];

  const words = upper
    .replace(/[_-]+/g, ' ')
    .replace(/\bNO\b/g, 'number')
    .replace(/\bNUM\b/g, 'number')
    .replace(/\bDESC\b/g, 'description')
    .replace(/\bQTY\b/g, 'quantity')
    .replace(/\bAMT\b/g, 'amount')
    .toLowerCase()
    .trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isHiddenField(key: string): boolean {
  return HIDDEN_FIELDS.has(key.toUpperCase());
}

/** Fields shown first in a result card, in this order, when present. */
export const PRIORITY_FIELDS = [
  'ORDERNO',
  'ORDERNUMBER',
  'DOCUMENT',
  'INVOICENO',
  'INVOICENUMBER',
  'DELIVERYNO',
  'TRACKINGNUMBER',
  'REFNUMBER',
  'STATUS',
  'ORDERSTATUS',
  'CREATIONDATE',
  'ORDERDATE',
  'INVOICEDATE',
  'DELIVERYDATE',
  'TOTAL',
  'TOTALAMOUNT',
  'NETVALUE',
];

/**
 * SAP hands back dates as YYYYMMDD, YYYY-MM-DD, or occasionally with a time.
 * Returns a readable date, or the original string when it is not a date at all.
 */
export function formatDate(value: string): string {
  const raw = value.trim();
  if (!raw || raw === '00000000' || raw === '0000-00-00') return '';

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  const dashed = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const match = compact ?? dashed;
  if (!match) return raw;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString('en-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** True when the field name suggests its value should be read as a date. */
export function looksLikeDateField(key: string): boolean {
  return /DATE|DUE|SHIPPED/i.test(key);
}

export function formatMoney(amount: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: currency || 'CAD',
    currencyDisplay: 'narrowSymbol',
  }).format(amount);
}

/** Presentation for one returned field: hidden, or a label plus a value. */
export function presentField(
  key: string,
  value: string
): { label: string; value: string } | null {
  if (isHiddenField(key)) return null;
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const shown = looksLikeDateField(key) ? formatDate(trimmed) : trimmed;
  if (!shown) return null;

  return { label: fieldLabel(key), value: shown };
}

/** Order a record's fields so the ones people look for come first. */
export function orderFields(keys: string[]): string[] {
  const rank = (key: string) => {
    const index = PRIORITY_FIELDS.indexOf(key.toUpperCase());
    return index === -1 ? PRIORITY_FIELDS.length : index;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

/**
 * How available an item is, phrased for a shopper rather than as a raw count.
 * `soon` is the date more stock reaches the warehouse, when one was given.
 */
export function stockWording(
  total: number,
  soon: string
): { tone: 'ok' | 'warn' | 'err'; text: string } {
  if (total > 20) return { tone: 'ok', text: 'In stock' };
  if (total > 0) return { tone: 'warn', text: `Only ${total} left` };
  if (soon) {
    return { tone: 'warn', text: `Out of stock — more expected ${formatDate(soon)}` };
  }
  return { tone: 'err', text: 'Out of stock' };
}

/** Warehouse code -> the city a shopper would recognise. */
export const LOCATION_NAMES: Record<string, string> = {
  '2911': 'Laval, QC',
  '2913': 'Calgary, AB',
  '2914': 'Halifax, NS',
  '2915': 'Burnaby, BC',
  '2916': 'Brampton, ON',
};

export function locationName(code: string, fallback = ''): string {
  return LOCATION_NAMES[code] || fallback || code;
}

/** Today, and the date `days` ago, as YYYY-MM-DD for the date inputs. */
export function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

/**
 * A readable order reference. Date-stamped so two orders placed on different
 * days never collide, and short enough to read down the phone.
 */
export function newOrderReference(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${stamp}-${suffix}`;
}
