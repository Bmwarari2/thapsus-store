/** Generate a URL-safe slug from a product name. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Append a short unique suffix to guarantee slug uniqueness. */
export function uniqueSlug(text: string, suffix?: string): string {
  const base = slugify(text);
  const id = suffix ?? Math.random().toString(36).slice(2, 7);
  return `${base}-${id}`;
}
