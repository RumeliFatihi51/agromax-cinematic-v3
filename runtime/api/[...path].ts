import { defineEventHandler } from "nitro/h3";
import { getApplication } from "../../commercial/runtime";
export default defineEventHandler(async (event) => {
  const response = await (await getApplication()).handle(event.req);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
});
