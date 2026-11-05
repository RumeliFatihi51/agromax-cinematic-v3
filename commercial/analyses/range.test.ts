import test from "node:test";
import assert from "node:assert/strict";
import { analysisWindow } from "./range";
test("custom analysis windows preserve UTC boundaries, include the requested last day and reject invalid ranges", () => {
  const now = new Date("2026-11-01T10:00:00Z"),
    custom = analysisWindow(
      { start: "2026-09-01", split: "2026-10-01", end: "2026-10-31" },
      now,
    );
  assert.equal(custom.range.from, "2026-09-01T00:00:00Z");
  assert.equal(custom.range.split, "2026-10-01T00:00:00Z");
  assert.equal(custom.range.to, "2026-11-01T00:00:00.000Z");
  assert.equal(custom.scope, "custom");
  assert.throws(() =>
    analysisWindow(
      { start: "2026-10-10", split: "2026-10-01", end: "2026-10-31" },
      now,
    ),
  );
  assert.throws(() =>
    analysisWindow(
      { start: "2026-02-30", split: "2026-10-01", end: "2026-10-31" },
      now,
    ),
  );
  assert.throws(() =>
    analysisWindow(
      { start: "2026-10-01", split: "2026-11-02", end: "2026-11-02" },
      now,
    ),
  );
  const partial = analysisWindow(
    { start: "2026-10-01", split: "2026-11-01", end: "2026-11-01" },
    now,
  );
  assert.equal(partial.range.to, now.toISOString());
  assert.equal(analysisWindow(undefined, now).scope, "calendar");
});
