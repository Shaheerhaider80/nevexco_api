/**
 * Endpoint registry.
 *
 * `deployed` reflects what actually answers on /qa, established by probing every
 * path in the vendor documentation — several documented endpoints return 404.
 * The dashboard renders this list directly.
 */

export interface EndpointInfo {
  id: string;
  name: string;
  path: string;
  rfc: string;
  contentType: string;
  deployed: boolean;
  /** Why an endpoint is unavailable, or what to watch out for when it is. */
  note?: string;
}

export const ENDPOINTS: EndpointInfo[] = [
  {
    id: 'products',
    name: 'Product Lookup',
    path: 'products-request',
    rfc: 'Z_SD_PRODUCTS_RFC',
    contentType: 'text/xml',
    deployed: true,
    note: 'LS_PRODUCTS is optional — omit it to page the whole catalog. TAKE caps at 250.',
  },
  {
    id: 'price',
    name: 'Pricing',
    path: 'GetPrice',
    rfc: 'Z_SD_PRICE',
    contentType: 'text/xml',
    deployed: true,
    note: 'Requires a MATERIALS list. Results split into RETURN_LIST and RETURN_ERROR.',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    path: 'inventory-request',
    rfc: 'Z_SD_INVENTORY_RFC',
    contentType: 'text/xml',
    deployed: true,
    note: 'Five warehouses: 2911 Laval, 2913 Calgary, 2914 Halifax, 2915 Burnaby, 2916 Brampton.',
  },
  {
    id: 'order',
    name: 'Order Creation',
    path: 'order-creation/',
    rfc: 'MT_Z_PO',
    contentType: 'text/xml',
    deployed: true,
    note: 'Not SOAP-wrapped. Returns 202 Accepted (async). Rate limit 40 req/min.',
  },
  {
    id: 'confirmation',
    name: 'Order Confirmation',
    path: 'confirmation-request',
    rfc: 'Z_SD_CONFIRMATION_RFC',
    contentType: 'text/xml',
    deployed: true,
    note: 'Field is REFNUMBER — matches the REFERENCENUMBER sent at creation.',
  },
  {
    id: 'orders',
    name: 'Order Search',
    path: 'order-request',
    rfc: 'Z_SD_ORDER_REQUEST_RFC',
    contentType: 'application/xml',
    deployed: true,
    note: 'PERIOD (STARTDATE + ENDDATE) is required, not optional.',
  },
  {
    id: 'tracking',
    name: 'Shipment Tracking',
    path: 'tracking-request',
    rfc: 'Z_SD_TRACKING_RFC',
    contentType: 'text/xml',
    deployed: true,
    note: 'All filters optional — REFNUMBER, ORDERNO, DELIVERYNO, TRACKINGNUMBER, PERIOD.',
  },
  {
    id: 'invoices',
    name: 'Invoices',
    path: 'invoice-request',
    rfc: 'Z_SD_INVOICE_RFC',
    contentType: 'text/xml',
    deployed: true,
    note: 'Line items, fee breakdowns, and Canadian tax detail (GST/PST/QST/HST).',
  },
  {
    id: 'invoice-pdf',
    name: 'Invoice PDF',
    path: 'invoice-pdf-request',
    rfc: 'Z_SD_INVOICE_PDF_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'Returns 404 on /qa, matching the "comingSoon" flag in the vendor docs. Not implemented here.',
  },
  {
    id: 'product-singular',
    name: 'Product Request (singular)',
    path: 'product-request',
    rfc: 'Z_SD_PRODUCTS_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'The docs list this path, but it 404s. The routed path is products-request (plural).',
  },
  {
    id: 'assortment',
    name: 'Assortment Request',
    path: 'assortment-request',
    rfc: 'Z_SD_ASSORTMENT_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'Documented but not deployed. Would have been a cheaper catalog sync.',
  },
  {
    id: 'assortment-full',
    name: 'Assortment Full Request',
    path: 'assortment-full-request',
    rfc: 'Z_SD_ASSORTMENT_FULL_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'Documented but not deployed.',
  },
  {
    id: 'delivery',
    name: 'Delivery Request',
    path: 'delivery-request',
    rfc: 'Z_SD_DELIVERY_REQUEST_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'Documented but not deployed.',
  },
  {
    id: 'inventory-full',
    name: 'Inventory Full Request',
    path: 'inventory-full-request',
    rfc: 'Z_SD_INVENTORY_FULL_REQ_RFC',
    contentType: 'text/xml',
    deployed: false,
    note: 'Documented but not deployed.',
  },
];

export const WAREHOUSES: Record<string, string> = {
  '2911': 'Laval, QC',
  '2913': 'Calgary, AB',
  '2914': 'Halifax, NS',
  '2915': 'Burnaby, BC',
  '2916': 'Brampton, ON',
};

/** Catalog size observed for the CB2BTEST1 account — used for sync progress. */
export const KNOWN_CATALOG_TOTAL = 21839;
