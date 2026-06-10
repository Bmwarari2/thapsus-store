/**
 * Normalize a Kenyan mobile number to the 254XXXXXXXXX format M-Pesa expects.
 * Accepts 07XXXXXXXX, 01XXXXXXXX, +2547…, 2547…, with optional spaces/dashes.
 * Returns null when the input is not a valid Kenyan mobile number.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  let normalized: string;
  if (/^0[17]\d{8}$/.test(digits)) {
    normalized = `254${digits.slice(1)}`;
  } else if (/^254[17]\d{8}$/.test(digits)) {
    normalized = digits;
  } else if (/^[17]\d{8}$/.test(digits)) {
    normalized = `254${digits}`;
  } else {
    return null;
  }
  return normalized;
}
