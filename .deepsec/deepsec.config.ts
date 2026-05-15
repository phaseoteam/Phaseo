import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "ai-stats-public", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
