/**
 * Local catalog cache.
 *
 * Novexco cannot filter products by category, so category browsing is only
 * possible against products we have already fetched. This store accumulates
 * pages as they are synced and derives the category index from them.
 *
 * Two backends, chosen by whether a Blob token is present:
 *
 *  - Vercel Blob when deployed. A serverless filesystem is read-only, so the
 *    previous fs.writeFile threw EROFS and the sync route answered with a
 *    0-byte 500. Even in /tmp it would not survive, because each invocation can
 *    land on a different instance.
 *  - A JSON file locally, so development needs no token and works offline.
 *
 * Records are trimmed to keep the whole catalog well under ~15MB - full detail
 * is fetched live per product.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  head,
  put,
} from '@vercel/blob';
import type { CategoryRef, ProductSummary } from './novexco-adapter';

const BLOB_PATH = 'catalog.json';
const FILE_PATH = path.join(process.cwd(), 'data', 'catalog.json');

/**
 * The catalog holds product names, codes, brands and image URLs - the same data
 * a storefront shows anyone. No prices (deliberately never cached), no orders,
 * no personal data. Switch to 'private' if your plan supports it and you would
 * rather the blob URL not be readable.
 */
const BLOB_ACCESS = 'public' as const;

/** Vercel injects this when a Blob store is linked to the project. */
function usingBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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

/**
 * A store plus the version it was read at. The version is the blob ETag, used
 * to make the read-modify-write in mergePage conditional.
 */
interface Snapshot {
  store: CatalogStore;
  version?: string;
}

/**
 * The full catalog approaches 6MB, and the product grid reads it on every page
 * view. Holding the last copy against its ETag turns an unchanged read into one
 * small metadata call instead of a 6MB download. Serverless instances are
 * reused, so this survives between requests often enough to matter.
 */
let cached: { store: CatalogStore; version: string } | null = null;

function parseStore(raw: string): CatalogStore {
  try {
    const parsed = JSON.parse(raw) as Partial<CatalogStore>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

async function readSnapshot(): Promise<Snapshot> {
  if (!usingBlob()) {
    try {
      return { store: parseStore(await fs.readFile(FILE_PATH, 'utf8')) };
    } catch {
      return { store: { ...EMPTY } };
    }
  }

  let version: string;
  try {
    version = (await head(BLOB_PATH)).etag;
  } catch (err) {
    // Nothing synced yet is the normal first-run state, not a failure.
    if (err instanceof BlobNotFoundError) return { store: { ...EMPTY } };
    throw err;
  }

  if (cached?.version === version) return { store: cached.store, version };

  // useCache: false reads from origin rather than the CDN, so a page written a
  // moment ago is never missed by the next page of the same sync run.
  const result = await get(BLOB_PATH, { access: BLOB_ACCESS, useCache: false });
  if (!result || result.statusCode !== 200) return { store: { ...EMPTY } };

  const store = parseStore(await new Response(result.stream).text());
  cached = { store, version };
  return { store, version };
}

/**
 * Persist the store. `version` makes the write conditional: if the blob changed
 * since it was read, the write is rejected rather than silently discarding the
 * other page. Returns the new version.
 */
async function writeSnapshot(
  store: CatalogStore,
  version?: string
): Promise<string | undefined> {
  const body = JSON.stringify(store);

  if (!usingBlob()) {
    // Writing to disk when deployed is what produced the original 0-byte 500,
    // so say which setup step is missing rather than failing as EROFS again.
    if (process.env.VERCEL) {
      throw new Error(
        'No Blob store is linked to this deployment, and the filesystem is ' +
          'read-only. Create a Blob store in the Vercel project (Storage tab) ' +
          'and redeploy so BLOB_READ_WRITE_TOKEN is available.'
      );
    }
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, body, 'utf8');
    return undefined;
  }

  const result = await put(BLOB_PATH, body, {
    access: BLOB_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    // Reads that must be current pass useCache: false, so this only bounds how
    // long a direct URL hit can lag. One minute is the floor the API allows.
    cacheControlMaxAge: 60,
    ...(version ? { ifMatch: version } : {}),
  });

  cached = { store, version: result.etag };
  return result.etag;
}

/** Reads persist as-is; a missing or corrupt store yields an empty one. */
export async function readStore(): Promise<CatalogStore> {
  return (await readSnapshot()).store;
}

export interface MergeResult {
  added: number;
  newCategories: number;
  store: CatalogStore;
}

function applyPage(
  store: CatalogStore,
  products: ProductSummary[],
  categories: CategoryRef[],
  reportedTotal: number,
  offset: number
): MergeResult {
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

  return { added, newCategories, store };
}

/**
 * Merge one synced page into the store. Products upsert by code, so re-syncing
 * an offset is harmless.
 *
 * The read-modify-write is retried when another sync writes first, so two tabs
 * syncing at once cannot drop each other's pages.
 */
export async function mergePage(
  products: ProductSummary[],
  categories: CategoryRef[],
  reportedTotal: number,
  offset: number
): Promise<MergeResult> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { store, version } = await readSnapshot();
    const merged = applyPage(store, products, categories, reportedTotal, offset);

    try {
      await writeSnapshot(merged.store, version);
      return merged;
    } catch (err) {
      if (!(err instanceof BlobPreconditionFailedError)) throw err;
      // Someone else wrote first. Drop the stale copy and rebuild on theirs.
      cached = null;
    }
  }

  throw new Error(
    'Could not save the catalog: it kept being updated by another sync. Try again.'
  );
}

export async function clearStore(): Promise<void> {
  cached = null;

  if (!usingBlob()) {
    await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(EMPTY), 'utf8');
    return;
  }

  try {
    await del(BLOB_PATH);
  } catch (err) {
    // Already gone is the desired end state.
    if (!(err instanceof BlobNotFoundError)) throw err;
  }
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
