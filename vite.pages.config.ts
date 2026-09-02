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
  // Servido no subcaminho do projeto no GitHub Pages
  base: "/confraternize-2026/",
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
