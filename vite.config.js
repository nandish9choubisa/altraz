import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // Use "/" for Cloudflare/Netlify/Vercel. For GitHub Pages project sites set VITE_BASE=/repo-name/
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
