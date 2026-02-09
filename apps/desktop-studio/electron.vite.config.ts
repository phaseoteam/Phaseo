import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
        "@main": resolve(__dirname, "src/main")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared")
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@shared": resolve(__dirname, "src/shared")
      }
    },
    plugins: [react()]
  }
});
