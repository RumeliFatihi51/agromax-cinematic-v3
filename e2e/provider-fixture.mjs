import { runInNewContext } from "node:vm";
import { PNG } from "pngjs";

if (process.env.AGROMAX_ISOLATED_BROWSER_FIXTURE !== "true" ||
  process.env.SENTINEL_CLIENT_ID !== "explicit-browser-fixture")
  throw new Error("The satellite fixture can only run inside isolated Playwright setup.");

const fetchNetwork = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.hostname === "identity.dataspace.copernicus.eu" && url.pathname.endsWith("/token"))
    return Response.json({ access_token: "explicit-browser-fixture-token", expires_in: 3600 });
  if (url.hostname !== "sh.dataspace.copernicus.eu") return fetchNetwork(input, options);
  if (url.pathname.endsWith("/catalog/1.0.0/search")) {
    const { datetime } = JSON.parse(options.body);
    const capture = "2026-01-01T09:00:00.000Z";
    const [start, end] = datetime.split("/");
    const features = capture >= start && capture < end
      ? [{ id: "EXPLICIT-PIPELINE-CATALOG-SCENE", properties: { datetime: capture, "eo:cloud_cover": 0 } }]
      : [];
    return Response.json({ features, context: {} });
  }
  if (url.pathname.endsWith("/process")) {
    const png = new PNG({ width: 48, height: 48 });
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const offset = (y * 48 + x) * 4;
      const t = 0.35 + 0.35 * Math.sin(x / 13) * Math.cos(y / 19);
      png.data.set([48 + 137 * t, 102 + 121 * t, 140 - 55 * t, 255], offset);
    }
    return new Response(PNG.sync.write(png), { headers: { "Content-Type": "image/png" } });
  }
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
