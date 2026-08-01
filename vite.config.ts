import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the static build works on Vercel/Netlify/GitHub Pages alike.
// A new id per build. Drives the service-worker cache name (so a redeploy
// actually reaches people) and the version stamp shown in the UI (so a bug
// report can say which build it came from).
const BUILD_ID = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

export default defineConfig({
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react()],
  build: {
    outDir: "dist",
    // demo.html is the legacy single-file preview; it is not part of the app build.
    rollupOptions: { input: "index.html" },
  },
});
