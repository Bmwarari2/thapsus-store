import { useEffect, useRef } from 'react';

/**
 * Calls onIntersect whenever the returned sentinel ref enters the viewport
 * (expanded by rootMargin so the next page loads before the user reaches the
 * bottom).
 */
export function useIntersection(onIntersect: () => void, rootMargin = '800px') {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onIntersect);
  callback.current = onIntersect;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return ref;
}
