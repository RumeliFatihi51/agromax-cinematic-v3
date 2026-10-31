import test from "node:test";
import assert from "node:assert/strict";
import { boundedStatistics } from "./statistics-request.js";
const DAY = 86400000;
const body = {
  aggregation: {
    timeRange: { from: "2026-08-31T21:00:00Z", to: "2026-10-30T18:00:00Z" },
    aggregationInterval: { of: "P1D" },
    evalscript: "Explicit isolated fixture",
  },
};
const sizeError = () =>
  Object.assign(new Error("Explicit provider size fixture"), {
    providerStatus: 400,
    providerDetail: "The calculation results are too large to process.",
  });
test("provider size errors split time without dropping outputs or moving the daily grid", async () => {
  const intervals = [];
  const budget = { requests: 0, maximum: 128 };
  const request = async (payload) => {
    const { from, to } = payload.aggregation.timeRange;
    if (Date.parse(to) - Date.parse(from) > 16 * DAY) throw sizeError();
    assert.equal(payload.aggregation.evalscript, body.aggregation.evalscript);
    const day = { interval: { from, to }, outputs: { fixture: true } };
    intervals.push(day.interval);
    return { status: "OK", data: [day] };
  };
  const response = await boundedStatistics(request, body, { budget });
  assert.equal(response.data.length, 4);
  assert.equal(budget.requests, 7);
  assert.equal(response.data[0].interval.from, body.aggregation.timeRange.from);
  assert.equal(response.data.at(-1).interval.to, body.aggregation.timeRange.to);
  for (let i = 1; i < intervals.length; i++)
    assert.equal(intervals[i].from, intervals[i - 1].to);
  assert.ok(
    intervals
      .slice(1)
      .every(
        (i) =>
          (Date.parse(i.from) - Date.parse(body.aggregation.timeRange.from)) %
            DAY ===
          0,
      ),
  );
});
test("unrelated provider errors are never retried as size errors", async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const failure = Object.assign(new Error("Explicit failure fixture"), {
      providerStatus: status,
      providerDetail: "The calculation results are too large",
    });
    await assert.rejects(
      boundedStatistics(async () => {
        calls++;
        throw failure;
      }, body),
      (e) => e === failure,
    );
    assert.equal(calls, 1);
  }
});
test("size retries are bounded and cancellation stops before another request", async () => {
  await assert.rejects(
    boundedStatistics(
      async () => {
        throw sizeError();
      },
      body,
      { budget: { requests: 0, maximum: 1 } },
    ),
    /istek sınırı/,
  );
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    boundedStatistics(
      async () => {
        calls++;
      },
      body,
      { signal: controller.signal },
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(calls, 0);
});
