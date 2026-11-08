# 4. D3 for math, React for the DOM

**Status:** Accepted

## Context

D3 is the most flexible visualization library, but its classic `select().enter().append()` style
mutates the DOM directly, which fights React's rendering model: duplicated state, effects that
re-run on every render, and charts that are hard to test.

## Decision

Use D3 only for scales, projections, shapes, and layout (`scaleBand`, `geoAlbersUsa`, `line`,
`bisector`). Render SVG with JSX. Interactions (hover, focus, keyboard) are React state.

## Consequences

- Charts are ordinary components: testable with Testing Library, keyboard-accessible via
  `tabIndex`/`onFocus`, and responsive through a shared `useWidth` hook.
- No D3 transitions out of the box. That's acceptable for an analytics tool, and CSS transitions
  cover the cases we need (e.g. stale-data dimming while refetching).
- Plotly is used in the Streamlit lab, where iteration speed matters more than control.
