import { render, screen } from "@testing-library/react";
import type { Driver, ExpiryBucket } from "./api";
import { DriversChart } from "./components/DriversChart";
import { ExpiryChart } from "./components/ExpiryChart";
import { barPath, columnPath } from "./components/shapes";
import { featureValue, fmt } from "./format";
import { narrative } from "./pages/LeaseDetail";

const drivers: Driver[] = [
  {
    feature: "rent_to_market",
    label: "Rent vs. market",
    value: 1.18,
    typical_value: 1.0,
    impact: -0.12,
  },
  { feature: "prior_renewals", label: "Prior renewals", value: 2, typical_value: 0, impact: 0.08 },
  { feature: "market_code", label: "Market", value: "ATL", typical_value: "NYC", impact: 0.01 },
];

describe("formatting", () => {
  it("formats feature values in business terms", () => {
    expect(featureValue("rent_to_market", 1.18)).toBe("118% of market");
    expect(featureValue("term_months", 60)).toBe("5 yrs");
    expect(featureValue("credit_score", 3)).toBe("BBB");
    expect(featureValue("market_code", "ATL")).toBe("ATL");
  });

  it("formats signed point changes", () => {
    expect(fmt.points(0.042)).toBe("+4.2 pts");
    expect(fmt.points(-0.1)).toBe("-10.0 pts");
  });
});

describe("narrative", () => {
  it("names the biggest negative and positive drivers", () => {
    const text = narrative(drivers);
    expect(text).toContain("rent vs. market (118% of market) lowers renewal odds by 12.0 pts");
    expect(text).toContain("prior renewals (2) adds 8.0 pts");
  });
});

describe("bar shapes", () => {
  it("returns empty paths for zero-size bars", () => {
    expect(columnPath(0, 0, 10, 0)).toBe("");
    expect(barPath(5, 5, 0, 10)).toBe("");
  });

  it("draws negative bars to the left of the zero line", () => {
    expect(barPath(100, 60, 0, 10)).toMatch(/^M100,0H64/);
  });
});

describe("charts", () => {
  it("renders a labelled bar and value for each driver", () => {
    render(<DriversChart drivers={drivers} />);
    expect(screen.getByText("Rent vs. market")).toBeInTheDocument();
    expect(screen.getByText("-12.0 pts")).toBeInTheDocument();
    expect(screen.getByText("Raises renewal odds")).toBeInTheDocument();
  });

  it("gives every quarter in the expiry wall a keyboard-focusable target", () => {
    const data: ExpiryBucket[] = [
      { quarter: "2026-Q4", high: 10_000, medium: 20_000, low: 30_000 },
      { quarter: "2027-Q1", high: 0, medium: 0, low: 50_000 },
    ];
    render(<ExpiryChart data={data} />);
    expect(screen.getByLabelText(/2026-Q4: 60K SF expiring, 10K SF high risk/)).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByText("High risk")).toBeInTheDocument();
  });
});
