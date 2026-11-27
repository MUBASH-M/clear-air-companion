import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  envDir: import.meta.dirname,
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/victory-vendor/")) {
            return "vendor-charts";
          }
          if (id.includes("/@vis.gl/react-google-maps/")) return "vendor-maps";
          if (
            id.includes("/react-markdown/") ||
            id.includes("/remark-") ||
            id.includes("/rehype-") ||
            id.includes("/micromark") ||
            id.includes("/mdast-") ||
            id.includes("/unist-")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("/lucide-react/")) return "vendor-icons";
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          ) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
