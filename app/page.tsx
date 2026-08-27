import Link from 'next/link';
import { ENDPOINTS, KNOWN_CATALOG_TOTAL } from '@/lib/endpoints';
import { readStore } from '@/lib/catalog-store';
import { SyncPanel } from './sync-panel';
import { Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const store = await readStore();
  const synced = Object.keys(store.products).length;
  const categories = Object.keys(store.categories).length;
  const total = store.reportedTotal || KNOWN_CATALOG_TOTAL;

  const live = ENDPOINTS.filter((e) => e.deployed);
  const dead = ENDPOINTS.filter((e) => !e.deployed);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Novexco Ordering API</h1>
        <p className="dim mt-1 max-w-3xl">
          SAP backend behind Azure API Management. Every call is a SOAP-wrapped RFC
          except order creation, which posts a bare SAP PI message. All requests are
          proxied server-side so credentials never reach the browser.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Products synced" value={synced.toLocaleString()} sub={`of ${total.toLocaleString()} in catalog`} />
        <Stat label="Categories found" value={categories.toLocaleString()} sub="discovered from synced products" />
        <Stat label="Endpoints live" value={`${live.length}`} sub={`${dead.length} documented but not deployed`} />
      </div>

      <SyncPanel />

      <Card
        title="Working endpoints"
        subtitle="Verified live against the QA environment."
      >
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Path</th>
                <th>Root element</th>
                <th>Content-Type</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {live.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className="font-medium">{endpoint.name}</td>
                  <td><code className="dim">/{endpoint.path}</code></td>
                  <td><code className="dim">{endpoint.rfc}</code></td>
                  <td className="dim">{endpoint.contentType}</td>
                  <td className="dim whitespace-normal min-w-[280px]">{endpoint.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Documented but unavailable"
        subtitle="These paths return 404 on QA. Probed directly — do not build against them."
      >
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Path</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {dead.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td className="font-medium dim">{endpoint.name}</td>
                  <td><code className="dim">/{endpoint.path}</code></td>
                  <td className="dim whitespace-normal min-w-[320px]">{endpoint.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Where to go next">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/catalog" className="surface p-3 block hover:opacity-80">
            <strong className="block">Catalog</strong>
            <span className="dim text-[13px]">
              Browse by department and category, then open a product for live price
              and warehouse stock.
            </span>
          </Link>
          <Link href="/explorer" className="surface p-3 block hover:opacity-80">
            <strong className="block">API Explorer</strong>
            <span className="dim text-[13px]">
              Run order creation, confirmation, search, tracking and invoices with
              full request and response XML.
            </span>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="surface p-4">
      <p className="dim text-[12px] font-medium">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      <p className="dim text-[12px] mt-0.5">{sub}</p>
    </div>
  );
}
