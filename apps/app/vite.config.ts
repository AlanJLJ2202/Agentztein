import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The app is served under /app/; the API lives in /api (Vercel functions at the repo root).
// @landing reaches the landing's 3D code (the Agentztein creature), so both share one model and one copy of three.js.
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  resolve: { alias: { "@landing": fileURLToPath(new URL("../landing/src", import.meta.url)) } },
});
