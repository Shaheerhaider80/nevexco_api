import { NextResponse } from 'next/server';
import { postXml } from '@/lib/novexco-client';
import { extractCategories, parseProducts } from '@/lib/novexco-adapter';
import { buildProductsXml } from '@/lib/requests';
import { mergePage, nextOffset, readStore } from '@/lib/catalog-store';

export const dynamic = 'force-dynamic';
// A 250-product page takes ~40s at the SAP end.
export const maxDuration = 300;

/**
 * Sync one page of the catalog into the local store.
 *
 * Categories are discovered as a side effect: every product carries its own
 * leaf category, and any code not already known is added to the index.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const skip = Number.parseInt(searchParams.get('skip') ?? '', 10);
  const take = Number.parseInt(searchParams.get('take') ?? '250', 10);

  const store = await readStore();
  const pageSize = Number.isFinite(take) ? take : 250;

  // Without an explicit offset, continue from the first gap.
  const offset = Number.isFinite(skip) ? skip : (nextOffset(store, pageSize) ?? 0);

  const xml = buildProductsXml({ skip: offset, take: pageSize });
  const raw = await postXml('products-request', xml);
  const parsed = parseProducts(raw.xml);

  if (parsed.fault) {
    return NextResponse.json(
      { ok: false, fault: parsed.fault, offset, ms: raw.ms },
      { status: 502 }
    );
  }

  const categories = extractCategories(parsed.products);
  const merged = await mergePage(parsed.products, categories, parsed.total, offset);

  return NextResponse.json({
    ok: true,
    offset,
    take: pageSize,
    ms: raw.ms,
    fetched: parsed.products.length,
    added: merged.added,
    newCategories: merged.newCategories,
    message: parsed.message,
    totals: {
      reported: merged.store.reportedTotal,
      synced: Object.keys(merged.store.products).length,
      categories: Object.keys(merged.store.categories).length,
    },
    nextOffset: nextOffset(merged.store, pageSize),
  });
}
