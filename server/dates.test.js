import test from "node:test";
import assert from "node:assert/strict";
import { isISODate } from "../shared/dates.js";
test("calendar dates reject normalized impossible dates and accept actual leap days", () => {
  for (const invalid of [
    "2026-02-29",
    "2026-02-31",
    "2026-04-31",
    "2026-13-01",
    "2026-1-1",
    "",
    null,
    20261030,
  ])
    assert.equal(isISODate(invalid), false);
  for (const valid of ["2024-02-29", "2026-10-30", "2026-12-31"])
    assert.equal(isISODate(valid), true);
});
