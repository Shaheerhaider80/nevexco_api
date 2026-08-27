'use client';

import { useState, type ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface p-4">
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="font-semibold text-[15px]">{title}</h2>}
            {subtitle && <p className="dim text-[12px] mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="dim text-[11px] mt-1 block">{hint}</span>}
    </label>
  );
}

/** Collapsible raw-XML panel — request and response, side by side on wide screens. */
export function XmlPanels({
  requestXml,
  responseXml,
}: {
  requestXml?: string;
  responseXml?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!requestXml && !responseXml) return null;

  return (
    <div className="mt-3">
      <button className="btn" onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide' : 'Show'} raw XML
      </button>
      {open && (
        <div className="grid gap-3 mt-3 lg:grid-cols-2">
          {requestXml && (
            <div>
              <p className="label">Request sent</p>
              <pre className="xml">{requestXml}</pre>
            </div>
          )}
          {responseXml && (
            <div>
              <p className="label">Response received</p>
              <pre className="xml">{responseXml}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Fault({ fault }: { fault?: { faultcode: string; faultstring: string } | null }) {
  if (!fault) return null;
  return (
    <div
      className="rounded-lg p-3 text-[13px]"
      style={{ background: 'var(--err-bg)', color: 'var(--err)' }}
    >
      <strong className="block mb-1">{fault.faultcode}</strong>
      <span>{fault.faultstring}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="dim text-[13px] py-6 text-center border border-dashed rounded-lg"
       style={{ borderColor: 'var(--border)' }}>
      {children}
    </p>
  );
}

/** Renders an arbitrary list of flat records — used by the explorer tabs. */
export function RecordTable({ rows }: { rows: Record<string, string>[] }) {
  if (!rows.length) return <Empty>No records returned.</Empty>;

  // Union of keys, so sparse records still line up.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return (
    <div className="scroll-x">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col}>{row[col] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timing({ ms, status }: { ms?: number; status?: number }) {
  if (ms === undefined) return null;
  return (
    <span className="chip">
      {status ? `HTTP ${status}` : 'done'} · {(ms / 1000).toFixed(1)}s
    </span>
  );
}
