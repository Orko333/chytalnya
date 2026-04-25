import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// In Docker: VITE_API_TARGET=http://backend:8000
// Local dev:  falls back to http://127.0.0.1:8000
const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/uploads": { target: API_TARGET, changeOrigin: true },
    },
  },
});
