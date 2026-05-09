# Visual QA

Playwright visual checks live here instead of `tests/` so Vitest does not
pick them up.

Run the full capture set:

```bash
npm run visual:qa
```

Useful focused runs:

```bash
npm run visual:apex
npm run visual:town
npm run visual:rooms
npm run visual:qa:headed
npm run visual:qa:record
```

Screenshots are written to `artifacts/visual/screenshots/`. HTML reports,
traces, and videos are written under `artifacts/visual/`.
