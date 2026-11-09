/** Parse an ISO date (YYYY-MM-DD) as a local date, not UTC midnight. */
export const parseDay = (iso: string) => new Date(`${iso}T00:00:00`);

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

export const fmt = {
  sqft: (n: number) => `${compact.format(n)} SF`,
  sqftFull: (n: number) => `${whole.format(n)} SF`,
  pct: (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`,
  signedPct: (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`,
  points: (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)} pts`,
  rent: (n: number) => `$${n.toFixed(2)}/SF`,
  date: (iso: string) =>
    parseDay(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
};

export interface YearChange {
  text: string;
  direction: "up" | "down" | "flat";
  good: boolean | null;
}

/**
 * Change versus 12 points earlier in a monthly series. `kind` picks the unit: a relative % change
 * (rent) or a difference in percentage points (rates like vacancy). `upIsGood` sets the tone.
 */
export function yearChange(
  values: number[],
  kind: "relative" | "points",
  upIsGood: boolean,
): YearChange | null {
  if (values.length < 13) return null;
  const now = values[values.length - 1];
  const then = values[values.length - 13];
  const diff = kind === "relative" ? (then === 0 ? 0 : now / then - 1) : now - then;
  const direction = Math.abs(diff) < 0.0005 ? "flat" : diff > 0 ? "up" : "down";
  const text =
    kind === "relative"
      ? fmt.signedPct(diff)
      : `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)} pts`;
  const good = direction === "flat" ? null : (direction === "up") === upIsGood;
  return { text, direction, good };
}

/** Render a model feature value the way an asset manager would say it. */
export function featureValue(feature: string, v: number | string): string {
  if (typeof v === "string") return v;
  switch (feature) {
    case "rent_to_market":
      return `${(v * 100).toFixed(0)}% of market`;
    case "market_vacancy":
      return fmt.pct(v, 1);
    case "market_rent_growth_12m":
      return fmt.signedPct(v);
    case "log_sqft":
      return fmt.sqft(Math.exp(v));
    case "term_months":
      return `${(v / 12).toFixed(0)} yrs`;
    case "building_age":
      return `${v.toFixed(0)} yrs`;
    case "clear_height_ft":
      return `${v.toFixed(0)} ft`;
    case "miles_to_highway":
      return `${v.toFixed(1)} mi`;
    case "docks_per_10k_sf":
      return v.toFixed(1);
    case "credit_score":
      return ["NR", "B", "BB", "BBB", "A"][Math.round(v)] ?? String(v);
    default:
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
}
