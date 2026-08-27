/**
 * Local catalog cache.
 *
 * Novexco cannot filter products by category, so category browsing is only
 * possible against products we have already fetched. This store accumulates
 * pages as they are synced and derives the category index from them.
 *
 * A JSON file is deliberate: this is a prototype, and the production target is
 * Wix Data rather than a database chosen here. Records are trimmed to keep the
 * whole catalog well under ~15MB - full detail is fetched live per product.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CategoryRef, ProductSummary } from './novexco-adapter';

const STORE_PATH = path.join(process.cwd(), 'data', 'catalog.json');

export interface CatalogStore {
  /** Product code -> summary. */
  products: Record<string, ProductSummary>;
  /** Leaf category code -> names. */
  categories: Record<string, CategoryRef>;
  /** TOTAL reported by the API, i.e. the full catalog size. */
  reportedTotal: number;
  /** SKIP offsets already fetched, so the UI can suggest the next page. */
  syncedOffsets: number[];
  lastSyncedAt: string | null;
}

const EMPTY: CatalogStore = {
  products: {},
  categories: {},
  reportedTotal: 0,
  syncedOffsets: [],
  lastSyncedAt: null,
};

/** Reads persist as-is; a missing or corrupt file yields an empty store. */
export async function readStore(): Promise<CatalogStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CatalogStore>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(store: CatalogStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store), 'utf8');
}

export interface MergeResult {
  added: number;
  newCategories: number;
  store: CatalogStore;
}

/**
 * Merge one synced page into the store. Products upsert by code, so re-syncing
 * an offset is harmless.
 */
export async function mergePage(
  products: ProductSummary[],
  categories: CategoryRef[],
  reportedTotal: number,
  offset: number
): Promise<MergeResult> {
  const store = await readStore();

  let added = 0;
  for (const product of products) {
    if (!store.products[product.code]) added += 1;
    store.products[product.code] = product;
  }

  let newCategories = 0;
  for (const category of categories) {
    if (!category.code) continue;
    if (!store.categories[category.code]) newCategories += 1;
    // Later pages may carry a better-populated name, so always take the newest.
    store.categories[category.code] = category;
  }

  if (reportedTotal > 0) store.reportedTotal = reportedTotal;
  if (!store.syncedOffsets.includes(offset)) {
    store.syncedOffsets.push(offset);
    store.syncedOffsets.sort((a, b) => a - b);
  }
  store.lastSyncedAt = new Date().toISOString();

  await writeStore(store);
  return { added, newCategories, store };
}

export async function clearStore(): Promise<void> {
  await writeStore({ ...EMPTY });
}

/** Products carrying a given leaf category code. */
export function productsInCategory(
  store: CatalogStore,
  categoryCode: string
): ProductSummary[] {
  return Object.values(store.products).filter(
    (product) => product.categoryCode === categoryCode
  );
}

/** How many synced products sit under each leaf category. */
export function categoryCounts(store: CatalogStore): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const product of Object.values(store.products)) {
    if (!product.categoryCode) continue;
    counts[product.categoryCode] = (counts[product.categoryCode] ?? 0) + 1;
  }
  return counts;
}

/** The next un-synced offset, or null once the catalog is fully loaded. */
export function nextOffset(store: CatalogStore, pageSize: number): number | null {
  const synced = new Set(store.syncedOffsets);
  const total = store.reportedTotal || Number.POSITIVE_INFINITY;

  for (let offset = 0; offset < total; offset += pageSize) {
    if (!synced.has(offset)) return offset;
  }
  return null;
}
