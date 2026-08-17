/**
 * Client-safe exact decimal helpers for live journal-entry UI totals.
 *
 * The database/server source of truth remains Prisma.Decimal. These helpers
 * deliberately use BigInt fixed-point arithmetic instead of Number so the
 * live editor never introduces JavaScript floating-point rounding.
 */
const SCALE = 4;
const SCALE_FACTOR = BigInt(10) ** BigInt(SCALE);

function parseDecimal(value: string | number): bigint {
  const raw = String(value ?? "").trim();
  if (!raw) return BigInt(0);

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const normalizedFraction = (fraction + "0".repeat(SCALE)).slice(0, SCALE);
  const scaled = BigInt(whole || "0") * SCALE_FACTOR + BigInt(normalizedFraction || "0");
  return negative ? -scaled : scaled;
}

function formatScaled(value: bigint): string {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE_FACTOR;
  const fraction = (absolute % SCALE_FACTOR).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function sumDecimalStrings(values: Array<string | number>): string {
  return formatScaled(values.reduce((sum, value) => sum + parseDecimal(value), BigInt(0)));
}

export function subtractDecimalStrings(left: string | number, right: string | number): string {
  return formatScaled(parseDecimal(left) - parseDecimal(right));
}

export function compareDecimalStrings(left: string | number, right: string | number): -1 | 0 | 1 {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isPositiveDecimal(value: string | number): boolean {
  return parseDecimal(value) > BigInt(0);
}

export function isNegativeDecimal(value: string | number): boolean {
  return parseDecimal(value) < BigInt(0);
}
