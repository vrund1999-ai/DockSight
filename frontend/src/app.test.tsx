import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { Driver, ExpiryBucket } from "./api";
import { DriversChart } from "./components/DriversChart";
import { ExpiryChart } from "./components/ExpiryChart";
import { ChartCard, RiskBadge } from "./components/primitives";
import { barPath, columnPath } from "./components/shapes";
import { featureValue, fmt, yearChange } from "./format";
import { narrative } from "./pages/LeaseDetail";
import { useTheme } from "./theme";

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

describe("ui", () => {
  it("shows every risk band as a shape plus a label, never color alone", () => {
    const { container } = render(
      <>
        <RiskBadge band="high" />
        <RiskBadge band="medium" />
        <RiskBadge band="low" />
      </>,
    );
    for (const label of ["High risk", "Watch", "Likely to renew"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      container.querySelectorAll(".risk-shape.high, .risk-shape.medium, .risk-shape.low"),
    ).toHaveLength(3);
  });

  it("switches a chart card to its table view", () => {
    render(<ChartCard title="Example" chart={<p>the chart</p>} table={<p>the table</p>} />);
    const tableBtn = screen.getByRole("button", { name: /table/i });
    expect(screen.getByText("the chart")).toBeInTheDocument();
    fireEvent.click(tableBtn);
    expect(tableBtn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("the table")).toBeInTheDocument();
    expect(screen.queryByText("the chart")).not.toBeInTheDocument();
  });

  it("applies and clears an explicit theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current[1]("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("docksight.theme")).toBe("dark");
    act(() => result.current[1]("system"));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem("docksight.theme")).toBeNull();
  });
});

describe("year-over-year change", () => {
  const series = (first: number, last: number) => [first, ...Array(11).fill(first), last];

  it("reports relative change and treats rising rent as good", () => {
    expect(yearChange(series(10, 11), "relative", true)).toEqual({
      text: "+10.0%",
      direction: "up",
      good: true,
    });
  });

  it("reports point change and treats rising vacancy as bad", () => {
    const c = yearChange(series(0.05, 0.062), "points", false);
    expect(c).toMatchObject({ text: "+1.2 pts", direction: "up", good: false });
  });

  it("needs a full year of history", () => {
    expect(yearChange([1, 2, 3], "relative", true)).toBeNull();
  });
});
