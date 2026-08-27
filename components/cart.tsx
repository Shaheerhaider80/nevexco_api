'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface BasketItem {
  code: string;
  name: string;
  brand: string;
  imageUrl: string;
  quantity: number;
  /** Price seen when the item was added. Re-checked on the basket page. */
  unitPrice: number;
  currency: string;
}

interface BasketApi {
  items: BasketItem[];
  count: number;
  estimatedTotal: number;
  /** Ready is false until the saved basket has been read, so counts never flicker. */
  ready: boolean;
  add: (item: Omit<BasketItem, 'quantity'>, quantity: number) => void;
  setQuantity: (code: string, quantity: number) => void;
  remove: (code: string) => void;
  clear: () => void;
  /** Correct stored prices after a live re-check. */
  repriceAll: (prices: Record<string, { unitPrice: number; currency: string }>) => void;
}

const STORAGE_KEY = 'novexco.basket.v1';

const BasketContext = createContext<BasketApi | null>(null);

function readSaved(): BasketItem[] {
  // Storage is unavailable in private modes and during server rendering, and a
  // half-written value should never take the whole app down.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BasketItem =>
        !!item &&
        typeof (item as BasketItem).code === 'string' &&
        Number((item as BasketItem).quantity) > 0
    );
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BasketItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(readSaved());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // A basket that cannot be saved still works for this visit.
    }
  }, [items, ready]);

  const add = useCallback(
    (item: Omit<BasketItem, 'quantity'>, quantity: number) => {
      const qty = Math.max(1, Math.trunc(quantity));
      setItems((current) => {
        const existing = current.find((line) => line.code === item.code);
        if (!existing) return [...current, { ...item, quantity: qty }];
        // Adding an item already in the basket tops it up rather than
        // silently replacing the quantity.
        return current.map((line) =>
          line.code === item.code
            ? { ...line, ...item, quantity: line.quantity + qty }
            : line
        );
      });
    },
    []
  );

  const setQuantity = useCallback((code: string, quantity: number) => {
    const qty = Math.trunc(quantity);
    setItems((current) =>
      qty <= 0
        ? current.filter((line) => line.code !== code)
        : current.map((line) => (line.code === code ? { ...line, quantity: qty } : line))
    );
  }, []);

  const remove = useCallback((code: string) => {
    setItems((current) => current.filter((line) => line.code !== code));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const repriceAll = useCallback(
    (prices: Record<string, { unitPrice: number; currency: string }>) => {
      setItems((current) =>
        current.map((line) =>
          prices[line.code]
            ? {
                ...line,
                unitPrice: prices[line.code].unitPrice,
                currency: prices[line.code].currency || line.currency,
              }
            : line
        )
      );
    },
    []
  );

  const value = useMemo<BasketApi>(
    () => ({
      items,
      count: items.reduce((sum, line) => sum + line.quantity, 0),
      estimatedTotal: items.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      ),
      ready,
      add,
      setQuantity,
      remove,
      clear,
      repriceAll,
    }),
    [items, ready, add, setQuantity, remove, clear, repriceAll]
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketApi {
  const context = useContext(BasketContext);
  if (!context) throw new Error('useBasket must be used inside BasketProvider');
  return context;
}
