'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Empty } from '@/components/ui';
import type { DepartmentNode } from '@/lib/categories';
import type { ProductSummary } from '@/lib/novexco-adapter';

interface StateResponse {
  tree: DepartmentNode[];
  totals: { reported: number; synced: number; categories: number; departments: number };
}

export default function CatalogPage() {
  const [tree, setTree] = useState<DepartmentNode[]>([]);
  const [totals, setTotals] = useState<StateResponse['totals'] | null>(null);
  const [openDept, setOpenDept] = useState<string | null>(null);
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/catalog/state', { cache: 'no-store' });
      if (!res.ok) return;
      const data: StateResponse = await res.json();
      setTree(data.tree);
      setTotals(data.totals);
      if (data.tree.length && !openDept) setOpenDept(data.tree[0].code);
    })();
    // Intentionally runs once; the tree only changes after a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // State is only written after an await, so a filter change that arrives
    // mid-flight discards the stale response instead of overwriting the grid.
    let cancelled = false;

    void (async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '24' });
      if (category) params.set('category', category);
      if (query.trim()) params.set('q', query.trim());

      try {
        const res = await fetch(`/api/products?${params}`, { cache: 'no-store' });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setProducts(data.products);
        setTotal(data.total);
        setPageCount(data.pageCount);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [category, query, page]);

  /** Changing a filter always returns to the first page. */
  const applyCategory = (code: string, name: string) => {
    setCategory(code);
    setCategoryName(name);
    setPage(1);
    setLoading(true);
  };

  const applyQuery = (value: string) => {
    setQuery(value);
    setPage(1);
    setLoading(true);
  };

  const isEmpty = useMemo(
    () => totals !== null && totals.synced === 0,
    [totals]
  );

  if (isEmpty) {
    return (
      <Card title="Catalog is empty">
        <p className="dim text-[13px]">
          No products have been synced yet. Novexco cannot filter products by
          category, so the category tree is built from products you fetch.
        </p>
        <Link href="/" className="btn btn-primary mt-3">
          Go to dashboard and sync
        </Link>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr] items-start">
      <aside className="surface p-3 lg:sticky lg:top-20">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-[14px]">Categories</h2>
          {totals && <span className="chip">{totals.categories}</span>}
        </div>

        <button
          className="btn w-full mb-2"
          onClick={() => applyCategory('', '')}
        >
          All synced products
        </button>

        <nav className="grid gap-0.5 max-h-[70vh] overflow-y-auto">
          {tree.map((dept) => (
            <div key={dept.code}>
              <button
                className="w-full text-left px-2 py-1.5 rounded-md text-[13px] font-medium hover:opacity-70 flex justify-between gap-2"
                onClick={() =>
                  setOpenDept((current) => (current === dept.code ? null : dept.code))
                }
              >
                <span>{dept.name}</span>
                <span className="dim tabular-nums">{dept.productCount}</span>
              </button>

              {openDept === dept.code &&
                dept.families.map((family) => (
                  <div key={family.code} className="ml-2">
                    <button
                      className="w-full text-left px-2 py-1 rounded-md text-[12px] dim hover:opacity-70 flex justify-between gap-2"
                      onClick={() =>
                        setOpenFamily((current) =>
                          current === family.code ? null : family.code
                        )
                      }
                    >
                      <span className="truncate">{family.label}</span>
                      <span className="tabular-nums">{family.productCount}</span>
                    </button>

                    {openFamily === family.code &&
                      family.leaves.map((leaf) => (
                        <button
                          key={leaf.code}
                          className="w-full text-left pl-4 pr-2 py-1 rounded-md text-[12px] hover:opacity-70 flex justify-between gap-2"
                          style={
                            category === leaf.code
                              ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                              : undefined
                          }
                          onClick={() => applyCategory(leaf.code, leaf.name)}
                        >
                          <span className="truncate">{leaf.name}</span>
                          <span className="tabular-nums">{leaf.productCount}</span>
                        </button>
                      ))}
                  </div>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="grid gap-4">
        <Card
          title={categoryName || 'All synced products'}
          subtitle={
            category
              ? `Category ${category} · ${total} product(s) in the local cache`
              : `${total} product(s) synced so far`
          }
          right={
            <input
              className="input max-w-[240px]"
              placeholder="Search name, code, brand…"
              value={query}
              onChange={(e) => applyQuery(e.target.value)}
            />
          }
        >
          {totals && totals.synced < totals.reported && (
            <p className="dim text-[12px] mb-3">
              Showing {totals.synced.toLocaleString()} of{' '}
              {totals.reported.toLocaleString()} catalog products. Categories and
              counts only reflect what has been synced.
            </p>
          )}

          {loading ? (
            <Empty>Loading…</Empty>
          ) : products.length === 0 ? (
            <Empty>No products match this filter.</Empty>
          ) : (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <Link
                  key={product.code}
                  href={`/catalog/${encodeURIComponent(product.code)}`}
                  className="surface p-3 hover:opacity-85 flex flex-col gap-2"
                >
                  <div
                    className="aspect-square rounded-md overflow-hidden flex items-center justify-center"
                    style={{ background: 'var(--surface-2)' }}
                  >
                    {product.imageUrl ? (
                      // Remote host is not configured for next/image, and these are
                      // vendor URLs that may change — a plain img is the safe choice.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.nameEn}
                        className="max-w-full max-h-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="dim text-[11px]">no image</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium leading-snug line-clamp-2">
                      {product.nameEn || product.code}
                    </p>
                    <p className="dim text-[11px] mt-1">
                      {product.code}
                      {product.brand ? ` · ${product.brand}` : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                className="btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </button>
              <span className="dim text-[13px]">
                Page {page} of {pageCount}
              </span>
              <button
                className="btn"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
