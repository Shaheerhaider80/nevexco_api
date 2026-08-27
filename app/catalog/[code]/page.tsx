'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Empty, Fault, Timing, XmlPanels } from '@/components/ui';
import type {
  InventoryRow,
  PriceResult,
  ProductDetail,
  SoapFault,
} from '@/lib/novexco-adapter';

interface DetailResponse {
  product?: ProductDetail;
  fault?: SoapFault;
  error?: string;
  ms?: number;
  requestXml?: string;
  rawXml?: string;
}

type PriceResponse = PriceResult & {
  ms?: number;
  status?: number;
  requestXml?: string;
  rawXml?: string;
};

interface InventoryResponse {
  fault: SoapFault | null;
  rows: InventoryRow[];
  ms?: number;
  status?: number;
  requestXml?: string;
  rawXml?: string;
}

/* Plain fetchers: they return data and never touch state, so the effect below
 * can assign state purely in its async continuations. */
async function fetchDetail(code: string): Promise<DetailResponse> {
  const res = await fetch(`/api/product/${encodeURIComponent(code)}`, {
    cache: 'no-store',
  });
  return res.json();
}

async function fetchPrice(code: string): Promise<PriceResponse> {
  const res = await fetch('/api/price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: [code] }),
  });
  return res.json();
}

async function fetchStock(code: string): Promise<InventoryResponse> {
  const res = await fetch('/api/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: [code] }),
  });
  return res.json();
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const productCode = decodeURIComponent(code);

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [stock, setStock] = useState<InventoryResponse | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    // Three independent requests so the data sheet renders without waiting on
    // pricing or stock. Price and inventory are always live, never cached.
    let cancelled = false;

    void (async () => {
      const data = await fetchDetail(productCode);
      if (!cancelled) setDetail(data);
    })();
    void (async () => {
      const data = await fetchPrice(productCode);
      if (!cancelled) setPrice(data);
    })();
    void (async () => {
      const data = await fetchStock(productCode);
      if (!cancelled) setStock(data);
    })();

    return () => {
      cancelled = true;
    };
  }, [productCode]);

  const refreshPrice = async () => {
    setPrice(null);
    setPrice(await fetchPrice(productCode));
  };

  const refreshStock = async () => {
    setStock(null);
    setStock(await fetchStock(productCode));
  };

  if (!detail) return <Empty>Loading product…</Empty>;

  if (detail.fault || detail.error || !detail.product) {
    return (
      <Card title={`Product ${productCode}`}>
        <Fault fault={detail.fault} />
        {detail.error && <Empty>{detail.error}</Empty>}
        <Link href="/catalog" className="btn mt-3">
          Back to catalog
        </Link>
      </Card>
    );
  }

  const product = detail.product;
  const images = product.images.length ? product.images : [product.imageUrl].filter(Boolean);

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2 text-[13px]">
        <Link href="/catalog" className="dim hover:opacity-70">
          Catalog
        </Link>
        <span className="dim">/</span>
        <span className="dim">{product.categoryEn || product.categoryCode}</span>
        <span className="dim">/</span>
        <span>{product.code}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr] items-start">
        <Card>
          <div
            className="aspect-square rounded-lg overflow-hidden flex items-center justify-center mb-3"
            style={{ background: 'var(--surface-2)' }}
          >
            {images[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[activeImage]}
                alt={product.nameEn}
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="dim text-[12px]">no image available</span>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setActiveImage(i)}
                  className="w-14 h-14 rounded-md overflow-hidden border"
                  style={{
                    borderColor: i === activeImage ? 'var(--accent)' : 'var(--border)',
                    background: 'var(--surface-2)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-4">
          <Card>
            <h1 className="text-lg font-semibold leading-snug">
              {product.nameEn || product.code}
            </h1>
            {product.nameFr && <p className="dim text-[13px] mt-0.5">{product.nameFr}</p>}

            <div className="flex flex-wrap gap-2 mt-3">
              <span className="chip">Code {product.code}</span>
              {product.brand && <span className="chip">{product.brand}</span>}
              {product.categoryCode && (
                <span className="chip">
                  {product.categoryEn} ({product.categoryCode})
                </span>
              )}
              {product.baseUom && <span className="chip">UOM {product.baseUom}</span>}
              {product.status && <span className="chip">Status {product.status}</span>}
            </div>

            {(product.longEn || product.longFr) && (
              <p className="text-[13px] mt-3 whitespace-pre-line">
                {product.longEn || product.longFr}
              </p>
            )}
          </Card>

          <Card
            title="Live pricing"
            subtitle="Fetched from GetPrice on every view — never cached."
            right={
              <div className="flex gap-2 items-center">
                <Timing ms={price?.ms} status={price?.status} />
                <button className="btn" onClick={() => void refreshPrice()}>
                  Refresh
                </button>
              </div>
            }
          >
            {!price ? (
              <Empty>Fetching price…</Empty>
            ) : price.fault ? (
              <Fault fault={price.fault} />
            ) : price.tiers.length === 0 ? (
              <Empty>
                No price returned for this product
                {price.errors.length ? ` — ${price.errors[0].error}` : '.'}
              </Empty>
            ) : (
              <>
                <div className="scroll-x">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>Min qty</th>
                        <th>Net</th>
                        <th>Promo</th>
                        <th>Contract</th>
                        <th>Effective</th>
                        <th>UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {price.tiers.map((tier, i) => {
                        const contract = tier.contractPrice > 0;
                        const promo = tier.promoPrice > 0;
                        const effective = contract
                          ? tier.contractPrice
                          : promo
                            ? tier.promoPrice
                            : tier.netPrice;
                        return (
                          <tr key={i}>
                            <td className="tabular-nums">{tier.scaleLevel || 1}+</td>
                            <td className="tabular-nums">
                              {tier.netPrice.toFixed(2)} {tier.currency}
                            </td>
                            <td className="tabular-nums dim">
                              {promo ? tier.promoPrice.toFixed(2) : '—'}
                            </td>
                            <td className="tabular-nums dim">
                              {contract ? tier.contractPrice.toFixed(2) : '—'}
                            </td>
                            <td className="tabular-nums font-semibold">
                              {effective.toFixed(2)}{' '}
                              <span className="chip ml-1">
                                {contract ? 'Contract' : promo ? 'Promo' : 'Net'}
                              </span>
                            </td>
                            <td className="dim">{tier.scaleUom}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {price.tiers[0]?.fees.length > 0 && (
                  <div className="mt-3">
                    <p className="label">Regional fees (apply by ship-to province)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {price.tiers[0].fees.map((fee, i) => (
                        <span key={i} className="chip">
                          {fee.region.split('-')[0]} {fee.amount.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <XmlPanels requestXml={price?.requestXml} responseXml={price?.rawXml} />
          </Card>

          <Card
            title="Live inventory"
            subtitle="Available-to-promise stock across the five Canadian warehouses."
            right={
              <div className="flex gap-2 items-center">
                <Timing ms={stock?.ms} status={stock?.status} />
                <button className="btn" onClick={() => void refreshStock()}>
                  Refresh
                </button>
              </div>
            }
          >
            {!stock ? (
              <Empty>Fetching stock…</Empty>
            ) : stock.fault ? (
              <Fault fault={stock.fault} />
            ) : stock.rows.length === 0 ? (
              <Empty>No inventory record returned for this product.</Empty>
            ) : (
              stock.rows.map((row) => (
                <div key={row.productCode}>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {row.weight > 0 && <span className="chip">Weight {row.weight}</span>}
                    {row.productStatus && (
                      <span className="chip chip-warn">Status {row.productStatus}</span>
                    )}
                    {row.dropShip && <span className="chip chip-warn">Drop-ship</span>}
                  </div>
                  <div className="scroll-x">
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>Warehouse</th>
                          <th>Code</th>
                          <th>Available</th>
                          <th>Next receiving</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.warehouses.map((wh) => (
                          <tr key={wh.code}>
                            <td>{wh.name || wh.code}</td>
                            <td className="dim">{wh.code}</td>
                            <td className="tabular-nums">
                              {wh.quantity > 0 ? (
                                <span className="chip chip-ok">{wh.quantity}</span>
                              ) : (
                                <span className="chip">0</span>
                              )}
                            </td>
                            <td className="dim">{wh.receivingDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
            <XmlPanels requestXml={stock?.requestXml} responseXml={stock?.rawXml} />
          </Card>

          {product.packaging.length > 0 && (
            <Card title="Packaging levels">
              <div className="scroll-x">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Level</th>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Barcode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.packaging.map((pack, i) => (
                      <tr key={i}>
                        <td>{pack.level}</td>
                        <td className="dim">{pack.code}</td>
                        <td>{pack.description}</td>
                        <td className="tabular-nums">{pack.quantity}</td>
                        <td className="dim">{pack.barcode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {product.ecoFees.length > 0 && (
            <Card
              title="Environmental fees"
              subtitle="Per-unit amounts by province, from the product data sheet."
            >
              <div className="flex flex-wrap gap-1.5">
                {product.ecoFees.map((fee) => (
                  <span key={fee.province} className="chip">
                    {fee.province} {fee.amount.toFixed(2)}
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card title="Product data sheet" right={<Timing ms={detail.ms} />}>
            <div className="scroll-x">
              <table className="grid">
                <tbody>
                  <tr>
                    <th>Internal (SAP) code</th>
                    <td className="dim">{product.internalCode || '—'}</td>
                  </tr>
                  <tr>
                    <th>Supplier product number</th>
                    <td className="dim">{product.supplierProductNumber || '—'}</td>
                  </tr>
                  <tr>
                    <th>Category code</th>
                    <td className="dim">{product.categoryCode || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <XmlPanels requestXml={detail.requestXml} responseXml={detail.rawXml} />
          </Card>
        </div>
      </div>
    </div>
  );
}
