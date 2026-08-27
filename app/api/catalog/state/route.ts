import { NextResponse } from 'next/server';
import {
  categoryCounts,
  nextOffset,
  readStore,
  clearStore,
} from '@/lib/catalog-store';
import { buildTree } from '@/lib/categories';

export const dynamic = 'force-dynamic';

/** Current sync progress plus the category tree discovered so far. */
export async function GET() {
  const store = await readStore();
  const counts = categoryCounts(store);
  const tree = buildTree(Object.values(store.categories), counts);

  return NextResponse.json({
    tree,
    totals: {
      reported: store.reportedTotal,
      synced: Object.keys(store.products).length,
      categories: Object.keys(store.categories).length,
      departments: tree.length,
    },
    pagesSynced: store.syncedOffsets.length,
    nextOffset: nextOffset(store, 250),
    lastSyncedAt: store.lastSyncedAt,
  });
}

/** Reset the local cache. Does not touch anything at Novexco. */
export async function DELETE() {
  await clearStore();
  return NextResponse.json({ ok: true });
}
