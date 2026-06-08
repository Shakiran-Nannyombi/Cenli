import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    // TanStack Router code-gen (must be before tanstackStart)
    TanStackRouterVite({ autoCodeSplitting: false }),
    // TanStack Start SSR
    tanstackStart({ server: { entry: "src/server.ts" } }),
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
