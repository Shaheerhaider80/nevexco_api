'use client';

import { useId, useState } from 'react';
import { Card, Empty, Fault, Field, RecordTable, Timing, XmlPanels } from '@/components/ui';
import { WAREHOUSES } from '@/lib/endpoints';
import type { GenericRow, SoapFault } from '@/lib/novexco-adapter';

type Tab = 'order' | 'confirmation' | 'orders' | 'tracking' | 'invoices';

const TABS: Array<{ id: Tab; label: string; endpoint: string }> = [
  { id: 'order', label: 'Order Creation', endpoint: '/order-creation/' },
  { id: 'confirmation', label: 'Order Confirmation', endpoint: '/confirmation-request' },
  { id: 'orders', label: 'Order Search', endpoint: '/order-request' },
  { id: 'tracking', label: 'Tracking', endpoint: '/tracking-request' },
  { id: 'invoices', label: 'Invoices', endpoint: '/invoice-request' },
];

/** Today and 30 days ago, for the endpoints that need a date range. */
function defaultPeriod() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export default function ExplorerPage() {
  const [tab, setTab] = useState<Tab>('order');

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">API Explorer</h1>
        <p className="dim mt-1 max-w-3xl">
          Run the transactional endpoints and inspect both the XML sent and the XML
          returned. Requests go through this app&apos;s server routes, so credentials
          stay server-side.
        </p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {TABS.map((item) => (
          <button
            key={item.id}
            className="btn"
            style={
              tab === item.id
                ? { background: 'var(--accent)', color: 'var(--accent-fg)', borderColor: 'transparent' }
                : undefined
            }
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'order' && <OrderForm />}
      {tab === 'confirmation' && <ConfirmationForm />}
      {tab === 'orders' && <OrderSearchForm />}
      {tab === 'tracking' && <TrackingForm />}
      {tab === 'invoices' && <InvoiceForm />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface OrderResponse {
  dryRun: boolean;
  accepted?: boolean;
  status?: number;
  ms?: number;
  ack?: { status: string; message: string };
  referenceNumber?: string;
  requestXml: string;
  rawXml?: string;
  note?: string;
  error?: string;
}

function OrderForm() {
  // useId is stable across renders and unique per mount, unlike Date.now(),
  // which would make render impure.
  const suffix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [reference, setReference] = useState(`PO-TEST-${suffix}`);
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [note, setNote] = useState('Test order — do not ship');
  const [lines, setLines] = useState([{ code: '1000090', quantity: 1 }]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OrderResponse | null>(null);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm,
          order: {
            referenceNumber: reference,
            purchaseOrder: purchaseOrder || undefined,
            warehouse: warehouse || undefined,
            note: note || undefined,
            lines,
          },
        }),
      });
      setResult(await res.json());
      // A submitted order must not be resubmitted by a stray second click.
      if (confirm) setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Order Creation"
      subtitle="Posts a bare SAP PI message (ns0:MT_Z_PO) — the one endpoint that is not SOAP-wrapped."
      right={<Timing ms={result?.ms} status={result?.status} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reference number" hint="Your PO / internal reference — the key for all later lookups.">
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Client PO number" hint="Optional — the customer's own PO.">
          <input className="input" value={purchaseOrder} onChange={(e) => setPurchaseOrder(e.target.value)} />
        </Field>
        <Field label="Warehouse" hint="Optional — leave blank to let Novexco choose.">
          <select className="select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="">(default)</option>
            {Object.entries(WAREHOUSES).map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="label">Order lines</p>
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              className="input"
              placeholder="Product code"
              value={line.code}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, j) => (j === i ? { ...l, code: e.target.value } : l))
                )
              }
            />
            <input
              className="input max-w-[110px]"
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l, j) =>
                    j === i ? { ...l, quantity: Number(e.target.value) } : l
                  )
                )
              }
            />
            <button
              className="btn"
              onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
              disabled={lines.length === 1}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() => setLines((prev) => [...prev, { code: '', quantity: 1 }])}
        >
          Add line
        </button>
      </div>

      <div
        className="rounded-lg p-3 mt-4"
        style={{ background: confirm ? 'var(--err-bg)' : 'var(--surface-2)' }}
      >
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[13px]">
            <strong style={confirm ? { color: 'var(--err)' } : undefined}>
              Really submit this order to Novexco QA
            </strong>
            <span className="dim block">
              Leave unticked for a dry run — the XML is built and shown, but nothing
              is sent. Ticking this creates a real order record.
            </span>
          </span>
        </label>
      </div>

      <button
        className={confirm ? 'btn btn-danger mt-3' : 'btn btn-primary mt-3'}
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? 'Working…' : confirm ? 'Submit order for real' : 'Build XML (dry run)'}
      </button>

      {result && (
        <div className="mt-4">
          {result.error ? (
            <Empty>{result.error}</Empty>
          ) : result.dryRun ? (
            <div className="chip chip-warn">Dry run — nothing was sent</div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <span className={result.accepted ? 'chip chip-ok' : 'chip chip-err'}>
                {result.accepted ? '202 Accepted' : `HTTP ${result.status}`}
              </span>
              {result.ack?.message && <span className="dim text-[13px]">{result.ack.message}</span>}
            </div>
          )}

          {!result.dryRun && result.accepted && (
            <p className="dim text-[12px] mt-2">
              202 means queued, not created. Use Order Confirmation with reference{' '}
              <strong>{result.referenceNumber}</strong> to get the Novexco order
              number — allow 2–5 minutes before polling.
            </p>
          )}

          <XmlPanels requestXml={result.requestXml} responseXml={result.rawXml} />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */

interface ListResponse {
  fault: SoapFault | null;
  message?: string;
  total?: number;
  rows: GenericRow[];
  pending?: boolean;
  ms?: number;
  status?: number;
  requestXml?: string;
  rawXml?: string;
  error?: string;
}

/** Shared result rendering for the four read-only lookups. */
function ResultBlock({ result }: { result: ListResponse | null }) {
  if (!result) return null;
  if (result.error) return <Empty>{result.error}</Empty>;
  if (result.fault) return <Fault fault={result.fault} />;

  return (
    <div className="mt-3">
      {result.pending && (
        <div className="chip chip-warn mb-3">
          No record yet — the order is still being processed. Poll again in a few minutes.
        </div>
      )}
      {result.message && <p className="dim text-[12px] mb-2">{result.message}</p>}
      <RecordTable rows={result.rows} />
      <XmlPanels requestXml={result.requestXml} responseXml={result.rawXml} />
    </div>
  );
}

function useLookup(endpoint: string) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ListResponse | null>(null);

  const run = async (payload: unknown) => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  };

  return { busy, result, run };
}

function ConfirmationForm() {
  const [refNumber, setRefNumber] = useState('');
  const { busy, result, run } = useLookup('/api/confirmation');

  return (
    <Card
      title="Order Confirmation"
      subtitle="Retrieves the Novexco order number and status. The field is REFNUMBER."
      right={<Timing ms={result?.ms} status={result?.status} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Reference number" hint="The REFERENCENUMBER you sent at order creation.">
          <input className="input" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn btn-primary mt-3"
        onClick={() => void run({ refNumber })}
        disabled={busy || !refNumber}
      >
        {busy ? 'Checking…' : 'Check confirmation'}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}

function OrderSearchForm() {
  const [period, setPeriod] = useState(defaultPeriod());
  const [refNumber, setRefNumber] = useState('');
  const { busy, result, run } = useLookup('/api/orders');

  return (
    <Card
      title="Order Search"
      subtitle="PERIOD is required by this endpoint — a date range must always be supplied."
      right={<Timing ms={result?.ms} status={result?.status} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Start date">
          <input
            className="input"
            type="date"
            value={period.startDate}
            onChange={(e) => setPeriod((p) => ({ ...p, startDate: e.target.value }))}
          />
        </Field>
        <Field label="End date">
          <input
            className="input"
            type="date"
            value={period.endDate}
            onChange={(e) => setPeriod((p) => ({ ...p, endDate: e.target.value }))}
          />
        </Field>
        <Field label="Reference number" hint="Optional filter.">
          <input className="input" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn btn-primary mt-3"
        onClick={() => void run({ period, refNumber: refNumber || undefined, take: 25 })}
        disabled={busy}
      >
        {busy ? 'Searching…' : 'Search orders'}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}

function TrackingForm() {
  const [refNumber, setRefNumber] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [usePeriod, setUsePeriod] = useState(true);
  const [period, setPeriod] = useState(defaultPeriod());
  const { busy, result, run } = useLookup('/api/tracking');

  return (
    <Card
      title="Shipment Tracking"
      subtitle="All filters optional. One order can produce several shipments."
      right={<Timing ms={result?.ms} status={result?.status} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Reference number">
          <input className="input" value={refNumber} onChange={(e) => setRefNumber(e.target.value)} />
        </Field>
        <Field label="Order number">
          <input className="input" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
        </Field>
        <Field label="Tracking number">
          <input
            className="input"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 mt-3 text-[13px] cursor-pointer">
        <input type="checkbox" checked={usePeriod} onChange={(e) => setUsePeriod(e.target.checked)} />
        Limit to a date range
      </label>

      {usePeriod && (
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          <Field label="Start date">
            <input
              className="input"
              type="date"
              value={period.startDate}
              onChange={(e) => setPeriod((p) => ({ ...p, startDate: e.target.value }))}
            />
          </Field>
          <Field label="End date">
            <input
              className="input"
              type="date"
              value={period.endDate}
              onChange={(e) => setPeriod((p) => ({ ...p, endDate: e.target.value }))}
            />
          </Field>
        </div>
      )}

      <button
        className="btn btn-primary mt-3"
        onClick={() =>
          void run({
            refNumber: refNumber || undefined,
            orderNo: orderNo || undefined,
            trackingNumber: trackingNumber || undefined,
            period: usePeriod ? period : undefined,
            take: 25,
          })
        }
        disabled={busy}
      >
        {busy ? 'Looking up…' : 'Find shipments'}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}

function InvoiceForm() {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [usePeriod, setUsePeriod] = useState(true);
  const [period, setPeriod] = useState(defaultPeriod());
  const { busy, result, run } = useLookup('/api/invoices');

  return (
    <Card
      title="Invoices"
      subtitle="Line items, fee breakdowns and Canadian tax detail. Max 250 records per call."
      right={<Timing ms={result?.ms} status={result?.status} />}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invoice number">
          <input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
        <Field label="Order number">
          <input
            className="input"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 mt-3 text-[13px] cursor-pointer">
        <input type="checkbox" checked={usePeriod} onChange={(e) => setUsePeriod(e.target.checked)} />
        Limit to a date range
      </label>

      {usePeriod && (
        <div className="grid gap-3 sm:grid-cols-2 mt-2">
          <Field label="Start date">
            <input
              className="input"
              type="date"
              value={period.startDate}
              onChange={(e) => setPeriod((p) => ({ ...p, startDate: e.target.value }))}
            />
          </Field>
          <Field label="End date">
            <input
              className="input"
              type="date"
              value={period.endDate}
              onChange={(e) => setPeriod((p) => ({ ...p, endDate: e.target.value }))}
            />
          </Field>
        </div>
      )}

      <button
        className="btn btn-primary mt-3"
        onClick={() =>
          void run({
            invoiceNo: invoiceNo || undefined,
            orderNumber: orderNumber || undefined,
            period: usePeriod ? period : undefined,
            take: 25,
          })
        }
        disabled={busy}
      >
        {busy ? 'Fetching…' : 'Fetch invoices'}
      </button>
      <ResultBlock result={result} />
    </Card>
  );
}
