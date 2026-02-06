import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "./src/ui",
  build: {
    outDir: "../../public",
    emptyOutDir: true
  },
  server: {
    port: 4983,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4984",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/ui")
    }
  }
});
