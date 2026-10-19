import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/healthz": { target: process.env.LAMBDA_SAFE_API_TARGET ?? "http://compiler:8080" },
      "/readyz": { target: process.env.LAMBDA_SAFE_API_TARGET ?? "http://compiler:8080" },
      "/v1": { target: process.env.LAMBDA_SAFE_API_TARGET ?? "http://compiler:8080" }
    }
  },
  preview: { host: "0.0.0.0" }
});
