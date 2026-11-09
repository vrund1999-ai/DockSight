// Apply a saved light/dark choice before first paint (an external file because the CSP blocks
// inline scripts). "system" leaves the attribute off so prefers-color-scheme decides.
try {
  var t = localStorage.getItem("docksight.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch (e) {}
