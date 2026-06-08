import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  preview: {
    // Allow all hosts so the container works on Cloud Run (and any other hosting)
    allowedHosts: true,
  },
  plugins: [
    // TanStack Start SSR (includes router functionality)
    tanstackStart({
      server: { entry: "src/server.ts" },
      router: { autoCodeSplitting: false }, // Disable code splitting to avoid HMR conflicts
    }),
    // React fast-refresh
    react(),
    // Tailwind v4
    tailwindcss(),
    // @ path alias from tsconfig
    tsConfigPaths(),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
