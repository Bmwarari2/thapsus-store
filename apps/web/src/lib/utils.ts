import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKes(cents: number) {
  return (cents / 100).toLocaleString("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  });
}

/**
 * The worker uploads each catalog image as …_320.webp / _640.webp / _1280.webp
 * and stores the 640w URL. Derive the responsive set by convention; legacy or
 * source-hosted URLs pass through untouched.
 */
export function imageSrcSet(url: string): { src: string; srcSet?: string } {
  if (!url?.endsWith('_640.webp')) return { src: url };
  const base = url.slice(0, -'_640.webp'.length);
  return {
    src: url,
    srcSet: `${base}_320.webp 320w, ${url} 640w, ${base}_1280.webp 1280w`,
  };
}

export function imageAtWidth(url: string, width: 320 | 640 | 1280): string {
  if (!url?.endsWith('_640.webp')) return url;
  return `${url.slice(0, -'_640.webp'.length)}_${width}.webp`;
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
