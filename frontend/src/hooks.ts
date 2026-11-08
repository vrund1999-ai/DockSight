import { useSearchParams } from "react-router-dom";

/** The market filter lives in the URL, so filtered views are shareable and survive refresh. */
export function useMarketParam() {
  const [params, setParams] = useSearchParams();
  const market = params.get("market") ?? undefined;
  const setMarket = (code: string | undefined) =>
    setParams(
      (p) => {
        if (code) p.set("market", code);
        else p.delete("market");
        p.delete("offset");
        return p;
      },
      { replace: true },
    );
  return [market, setMarket] as const;
}
