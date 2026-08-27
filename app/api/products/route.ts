import { NextResponse } from 'next/server';
import { productsInCategory, readStore } from '@/lib/catalog-store';

export const dynamic = 'force-dynamic';

/**
 * Products from the local store, optionally filtered by leaf category.
 *
 * Reads the cache rather than Novexco: the API has no category filter, so this
 * can only ever cover products already synced.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') ?? '';
  const search = (searchParams.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    96,
    Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '24', 10) || 24)
  );

  const store = await readStore();
  let products = category
    ? productsInCategory(store, category)
    : Object.values(store.products);

  if (search) {
    products = products.filter(
      (product) =>
        product.nameEn.toLowerCase().includes(search) ||
        product.code.toLowerCase().includes(search) ||
        product.brand.toLowerCase().includes(search)
    );
  }

  products.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  const start = (page - 1) * pageSize;
  return NextResponse.json({
    products: products.slice(start, start + pageSize),
    total: products.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(products.length / pageSize)),
  });
}
