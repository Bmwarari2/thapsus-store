import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGetFeed, type FeedPage } from '../lib/api';

export interface FeedFilters {
  category?: string;
  q?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
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
