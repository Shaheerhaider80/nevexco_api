# Novexco API — Explorer & Storefront Prototype

A standalone Next.js app that implements every working endpoint of the **Novexco
Ordering API** and surfaces it visually: a storefront-style catalog for browsing,
and a developer explorer for the transactional calls.

Nothing in `../wixcustom` is touched. This is a sibling project.

---

## Running it

```bash
npm install
cp .env.example .env.local   # fill in your credentials
npm run dev                  # http://localhost:3000
```

`.env.local` holds the credentials and is gitignored:

| Variable | Purpose |
|---|---|
| `NOVEXCO_BASE_URL` | `https://nvx-p-dpo-api.azure-api.net/qa` |
| `NOVEXCO_API_KEY` | `Ocp-Apim-Subscription-Key` header value |
| `NOVEXCO_CUSTOMER` | Customer ID (max 10 chars) |
| `NOVEXCO_PASSWORD` | API password (max 40 chars) |

Every Novexco call is proxied through this app's server routes. The key and
password authorize real orders and invoice access, so they never reach the
browser.

The routes return the request XML they sent so the explorer can show the real
shape of a call. Because every SOAP envelope carries `CUSTOMER` and `PASSWORD`
in its body, that XML is passed through `redactXml()` first — otherwise the
account password would be delivered to the browser on every request.

---

## What the API actually looks like

The backend is **SAP**, fronted by Azure API Management. Calls are SOAP-wrapped
RFC invocations:

```xml
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"
                   xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soap-env:Body>
    <urn:Z_SD_PRODUCTS_RFC>
      <CUSTOMER>…</CUSTOMER><PASSWORD>…</PASSWORD>
      …
    </urn:Z_SD_PRODUCTS_RFC>
  </soap-env:Body>
</soap-env:Envelope>
```

**Order creation is the exception** — it posts a bare SAP PI message
(`ns0:MT_Z_PO`, namespace `urn:Novexco.com:Orders:Inbound`) with no envelope.

### Deployed endpoints

| Endpoint | Path | Root element |
|---|---|---|
| Product Lookup | `/products-request` | `Z_SD_PRODUCTS_RFC` |
| Pricing | `/GetPrice` | `Z_SD_PRICE` |
| Inventory | `/inventory-request` | `Z_SD_INVENTORY_RFC` |
| Order Creation | `/order-creation/` | `MT_Z_PO` |
| Order Confirmation | `/confirmation-request` | `Z_SD_CONFIRMATION_RFC` |
| Order Search | `/order-request` | `Z_SD_ORDER_REQUEST_RFC` |
| Tracking | `/tracking-request` | `Z_SD_TRACKING_RFC` |
| Invoices | `/invoice-request` | `Z_SD_INVOICE_RFC` |

### Documented but **not deployed** (all return 404)

`product-request` (the docs' singular spelling — the routed path is the plural
one), `invoice-pdf-request` (matches its `comingSoon` flag), `assortment-request`,
`assortment-full-request`, `delivery-request`, `inventory-full-request`.

---

## Findings that contradict the vendor documentation

These were established by probing the live QA environment, and the code depends
on them:

1. **`/products-request` is plural.** The documentation site says
   `/product-request`; that path 404s.
2. **`LS_WAREHOUSES` cannot be empty.** Sending `<LS_WAREHOUSES/>` returns an
   empty `<WAREHOUSE/>` rather than every warehouse. All five codes are sent
   explicitly by default — see `ALL_WAREHOUSES` in `lib/requests.ts`.
3. **`PERIOD` is mandatory on Order Search**, unlike the other lookups.
4. **Order Confirmation's field is `REFNUMBER`**, not `REFERENCENUMBER`.
5. **Order Search is documented with `application/xml`**; everything else uses
   `text/xml`.
6. **Single-element lists collapse.** SAP returns `<IMAGES><item>…</item></IMAGES>`
   as an object, not an array, when there is exactly one entry — hence `arr()` in
   the adapter.

---

## Categories: there is no categories endpoint

Novexco cannot list categories, and cannot filter products by one. Each product
carries its own leaf category instead:

```xml
<CATEGORY>
  <item><CODE>NP2703D</CODE><LANGUE>EN</LANGUE><DESCRIPTION>Cash Boxes</DESCRIPTION></item>
  <item><CODE>NP2703D</CODE><LANGUE>FR</LANGUE><DESCRIPTION>Petites caisses</DESCRIPTION></item>
</CATEGORY>
```

So the category tree is **discovered by paging the catalog**: each synced page
contributes any category codes not already seen. Category browsing therefore only
covers products already synced, and the UI always shows "X of 21,839 synced" so
this is never misleading.

The code encodes a hierarchy — `NP2703D` = department `NP`, family `27`, leaf
`03`. **Only the leaf is named by the API.** Department names live in
`DEPARTMENT_NAMES` (`lib/categories.ts`) because they exist nowhere in the vendor
data; an unrecognised code falls back to displaying the raw code.

---

## Layout

```
lib/
  novexco-client.ts    SOAP envelope building, transport, XML escaping
  novexco-adapter.ts   XML → typed JSON (fast-xml-parser)
  requests.ts          One request builder per endpoint
  catalog-store.ts     Local JSON cache: merge, query, progress
  categories.ts        Code → department/family/leaf; tree building
  endpoints.ts         Endpoint registry incl. deployment status
app/
  page.tsx             Dashboard: endpoint status + sync control
  catalog/             Category tree + product grid
  catalog/[code]/      Detail + live price + live stock
  explorer/            Transactional endpoint forms
  api/                 Server routes, one per endpoint
```

`novexco-client` / `novexco-adapter` deliberately mirror the client/adapter split
in `../wixcustom/velo/backend/`, so the logic ports to Velo later. Unlike Velo
(dependency-free by constraint), this project uses `fast-xml-parser` — the
responses nest too deeply for regex parsing to be safe.

### Caching policy

Catalog data is cached at ~294 bytes per product, so the full catalog lands
around 6 MB. **Price and inventory are never cached** — they are fetched live on
every product view, because a stale price is a mis-sale.

The cache has two backends, picked by whether `BLOB_READ_WRITE_TOKEN` is set:

| Where | Backend | Why |
|---|---|---|
| Local | `data/catalog.json` (gitignored) | No token needed; works offline. |
| Deployed | Vercel Blob (`catalog.json`) | A serverless filesystem is read-only. |

Reads go through `head()` first and only download the body when the ETag has
changed, so an unchanged read costs one metadata call rather than 6 MB. Writes
are conditional on that ETag, so two tabs syncing at once cannot drop each
other's pages.

## Deploying

Create a Blob store on the Vercel project (Storage tab) and redeploy — that is
what supplies `BLOB_READ_WRITE_TOKEN`. Without it the catalog sync fails,
because it falls back to writing a file onto a read-only filesystem.

Set `NOVEXCO_BASE_URL`, `NOVEXCO_API_KEY`, `NOVEXCO_CUSTOMER` and
`NOVEXCO_PASSWORD` as project environment variables too.

---

## Order safety

Order creation **defaults to a dry run**: the exact XML is built and displayed but
nothing is sent. Submitting for real requires ticking an explicit confirmation
box in the UI, or `confirm: true` in the API payload.

A successful submit returns **202 Accepted**, which means queued — not created.
Poll Order Confirmation with the same reference number to get the real Novexco
order number, allowing 2–5 minutes. Order creation is rate-limited to 40
requests/minute.

---

## Verified behaviour

Checked against the live QA environment with the `CB2BTEST1` test account:

- Catalog reports **21,839 products**; 250-product pages return in ~6s.
- Product `344523` → "OFFIX 7 COMP.CASHBOX SAND", category `NP2703D` "Cash Boxes".
- Product `1000090` → **101.39 CAD**, eco-fees BC 0.35 / QC 0.20.
- Inventory for `344523` → all five warehouses (Laval 893, Calgary 15, Halifax 12,
  Burnaby 23, Brampton 12 with a 2025-10-31 receiving date).
- Order Search, Confirmation, Tracking and Invoices all respond cleanly with
  "No data found." — the test account has no order history, so these are verified
  as working but not yet exercised against populated data.

---

## Open items

- Credentials are a **test account**; a real account's assortment and pricing will
  differ.
- **Production base URL is unknown** — only `/qa` has been exercised. The client
  reads the base from env, so switching is configuration rather than code.
- Invoice PDF cannot be implemented until Novexco deploys the endpoint.
- Order Search / Tracking / Invoices remain unproven against real records; placing
  one test order would exercise the full create → confirm → track → invoice loop.
