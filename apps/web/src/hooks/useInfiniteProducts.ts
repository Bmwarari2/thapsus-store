import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGetFeed, type FeedPage } from '../lib/api';

export interface FeedFilters {
  category?: string;
  q?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Shuffle seed for sort=recommended; same seed keeps pagination stable. */
  seed?: string;
}

/** A per-browser-session shuffle seed — every visit deals a fresh ordering. */
export function sessionFeedSeed(): string {
  const key = 'thapsus-feed-seed';
  let seed = sessionStorage.getItem(key);
  if (!seed) {
    seed = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(key, seed);
  }
  return seed;
}

/** Cursor-fed infinite product feed. Pages stay cached per filter set. */
export function useInfiniteProducts(filters: FeedFilters) {
  return useInfiniteQuery<FeedPage>({
    queryKey: ['feed', filters],
    queryFn: ({ pageParam }) =>
      apiGetFeed({
        category: filters.category,
        q: filters.q,
        sort: filters.sort,
        seed: filters.sort === 'recommended' ? (filters.seed ?? sessionFeedSeed()) : undefined,
        min_price: filters.minPrice,
        max_price: filters.maxPrice,
        cursor: (pageParam as string | undefined) ?? undefined,
        limit: 24,
      }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
