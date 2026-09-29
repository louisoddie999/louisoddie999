import { defineConfig } from "vite";

export default defineConfig({
  base: "./",                       // relative asset paths, so the build runs from any sub-path
  build: { chunkSizeWarningLimit: 700, assetsInlineLimit: 0 },
});
