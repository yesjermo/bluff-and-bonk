import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // GitHub Pages serves the site under /bluff-and-bonk/; set VITE_BASE for that build.
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../shared/src", import.meta.url)) },
  },
  server: { host: true, port: 5180, fs: { allow: [".."] } },
  preview: { host: true, port: 4173 },
});
