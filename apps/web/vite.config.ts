import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          framework: ["react", "react-dom", "react-router"],
          ui: ["@vnsf/ui"],
          data: [
            "@tanstack/react-query",
            "react-hook-form",
            "zod",
            "i18next",
            "react-i18next",
          ],
        },
      },
    },
  },
  test: { exclude: ["e2e/**", "node_modules/**", "dist/**"] },
});
