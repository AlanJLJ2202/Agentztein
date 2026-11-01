import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The panel is served under /panel/; the site root is the landing page (apps/landing).
export default defineConfig({ base: "/panel/", plugins: [react()] });
