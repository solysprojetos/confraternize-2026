// Build estático do formulário para GitHub Pages (sem SSR/TanStack Start).
// Usado por `bun run build:pages`; o deploy é feito por
// .github/workflows/deploy-pages.yml e publica em
// https://<owner>.github.io/confraternize-2026/
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "pages-static",
  // Raiz por padrão (Vercel etc.); o GitHub Pages define PAGES_BASE com o
  // subcaminho /confraternize-2026/ no workflow
  base: process.env.PAGES_BASE || "/",
  publicDir: path.resolve(__dirname, "public"),
  envDir: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-pages"),
    emptyOutDir: true,
  },
  preview: { host: "127.0.0.1", port: 4173 },
});
