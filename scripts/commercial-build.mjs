process.env.AGROMAX_RUNTIME = "commercial";
const { createBuilder } = await import("vite");
const builder = await createBuilder();
await builder.buildApp();
