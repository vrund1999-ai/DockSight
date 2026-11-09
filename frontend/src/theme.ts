import { useCallback, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "docksight.theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Apply a theme preference: "system" defers to prefers-color-scheme via CSS. */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies for this session.
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const set = useCallback((next: ThemePref) => {
    applyTheme(next);
    setPref(next);
  }, []);
  return [pref, set] as const;
}
