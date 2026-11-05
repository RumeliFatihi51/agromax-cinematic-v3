import { AsyncLocalStorage } from "node:async_hooks";
const scope = new AsyncLocalStorage();
/** @param {(event: {operation:string,durationMs:number,httpStatus:number|null})=>Promise<void>} sink @param {()=>Promise<any>} work */
export function withProviderMeter(sink, work) {
  return scope.run(sink, work);
}
/** Only static operation names and response metadata enter the meter. Never URL queries, credentials or bodies. */
export async function meterProvider(operation, work) {
  const started = performance.now();
  let status = null;
  try {
    const response = await work();
    status = response.status;
    return response;
  } finally {
    const sink = scope.getStore();
    if (sink)
      await sink({
        operation,
        durationMs: Math.round(performance.now() - started),
        httpStatus: status,
      }).catch(() =>
        console.error("Provider usage measurement could not be stored."),
      );
  }
}
