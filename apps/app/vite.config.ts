import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app is served under /app/; the API lives in /api (Vercel functions at the repo root).
export default defineConfig({ base: "/app/", plugins: [react()] });
