import { runInNewContext } from "node:vm";

if (process.env.AGROMAX_ISOLATED_BROWSER_FIXTURE !== "true" ||
  process.env.SENTINEL_CLIENT_ID !== "explicit-browser-fixture")
  throw new Error("The satellite fixture can only run inside isolated Playwright setup.");

const fetchNetwork = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "identity.dataspace.copernicus.eu" && url.pathname.endsWith("/token"))
    return Response.json({ access_token: "explicit-browser-fixture-token", expires_in: 3600 });
  if (url.hostname !== "sh.dataspace.copernicus.eu") return fetchNetwork(input, options);
  if (url.pathname.endsWith("/catalog/1.0.0/search"))
    return Response.json({ features: [], context: {} });
  if (!url.pathname.endsWith("/statistics"))
    throw new Error("Unexpected satellite call in the isolated browser fixture.");

  const { evalscript, timeRange } = JSON.parse(options.body).aggregation;
  const { output } = runInNewContext(evalscript + "\nsetup()", {}, { timeout: 500 });
  const days = [];
  for (let from = Date.parse(timeRange.from); from < Date.parse(timeRange.to); from += 86400000) {
    const day = days.length;
    const mean = day === 0 ? 0.2 : 0.4;
    const outputs = Object.fromEntries(output.filter(({ id }) => id !== "dataMask").map(({ id }) =>
      [id, { bands: { B0: { stats: { mean, min: mean, max: mean, stDev: 0, sampleCount: 25, noDataCount: 0 } } } }]));
    days.push({
      interval: {
        from: new Date(from).toISOString(),
        to: new Date(Math.min(from + 86400000, Date.parse(timeRange.to))).toISOString(),
      },
      outputs,
    });
  }
  return Response.json({ status: "OK", data: days });
};
