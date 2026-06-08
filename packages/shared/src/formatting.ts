/** Format KES cents into a display string: 149900 → "KES 1,499" */
export function formatKes(cents: number): string {
  return `KES ${Math.round(cents / 100).toLocaleString("en-KE")}`;
}

/** Format a delivery estimate range into a human string. */
export function formatDeliveryDays(min: number, max: number): string {
  if (min === max) return `${min} business days`;
  return `${min}–${max} business days`;
}

/** Add N business days to a date (skips weekends). */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

/** Return the estimated delivery date range string: "Jun 20 – Jun 27" */
export function estimatedDeliveryRange(from: Date, minDays: number, maxDays: number): string {
  const earliest = addBusinessDays(from, minDays);
  const latest = addBusinessDays(from, maxDays);
  const fmt = new Intl.DateTimeFormat("en-KE", { month: "short", day: "numeric" });
  return `${fmt.format(earliest)} – ${fmt.format(latest)}`;
}
