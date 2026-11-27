import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { attachCentralErrorHandler, createExpressApp } from "./server/app";

function parseCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const PORT = Number(parseCliArg("--port") || process.env.PORT) || 3000;
const HOST = parseCliArg("--host") || process.env.HOST || "0.0.0.0";
const IS_PROD = process.env.NODE_ENV === "production";
const ROOT_DIR = import.meta.dirname;
const CLIENT_DIR = path.resolve(ROOT_DIR, "client");
const DIST_DIR = path.resolve(ROOT_DIR, "dist/public");

async function startServer() {
  const app = createExpressApp({ isProd: IS_PROD });

  let viteServer: { close: () => Promise<void> } | null = null;

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: path.resolve(ROOT_DIR, "vite.config.ts"),
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: "spa",
    });
    viteServer = vite;

    app.use(vite.middlewares);

    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) return next();
      try {
        const htmlPath = path.resolve(CLIENT_DIR, "index.html");
        const rawHtml = fs.readFileSync(htmlPath, "utf-8");
        const html = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-cache" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Immutable CDN caching for content-hashed build assets; no-cache for HTML entrypoint
    app.use(
      "/assets",
      express.static(path.resolve(DIST_DIR, "assets"), {
        immutable: true,
        maxAge: "1y",
      }),
    );
    app.use(
      express.static(DIST_DIR, {
        maxAge: "1h",
        setHeaders(res, filePath) {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.originalUrl.startsWith("/api/")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.resolve(DIST_DIR, "index.html"));
    });
  }

  attachCentralErrorHandler(app);

  const httpServer = app.listen(PORT, HOST, () => {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "server_started",
        host: HOST,
        port: PORT,
        mode: IS_PROD ? "production" : "development",
      }),
    );
  });

  const shutdown = () => {
    httpServer.close(() => {
      Promise.resolve(viteServer?.close())
        .catch(() => {})
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err instanceof Error ? err.message : "unknown error");
  process.exit(1);
});
