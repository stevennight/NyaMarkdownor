import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const moduleId = id.replaceAll("\\", "/");
          if (!moduleId.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) return "vendor-react";
          if (moduleId.includes("/node_modules/@codemirror/") || moduleId.includes("/node_modules/@lezer/")) return "vendor-editor";
          if (moduleId.includes("/node_modules/@tiptap/") || moduleId.includes("/node_modules/prosemirror-")) return "vendor-rich-editor";
          if (/\/node_modules\/(markdown-it|linkify-it|mdurl|entities|uc\.micro|punycode)\//.test(moduleId)) return "vendor-markdown";
          if (moduleId.includes("/node_modules/@tauri-apps/")) return "vendor-tauri";
          return undefined;
        }
      }
    }
  }
});
