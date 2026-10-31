import http from "node:http";
import { createServer } from "vite";
import { createApplication } from "./application.js";
const app = await createApplication();
const vite = await createServer({
  server: { middlewareMode: true, host: "127.0.0.1" },
  appType: "spa",
});
http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/")) return app.handle(req, res);
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  })
  .listen(5173, "127.0.0.1", () =>
    console.log("Agromax: http://127.0.0.1:5173"),
  );
