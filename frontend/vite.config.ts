import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Pure SPA config — no SSR, no TanStack Start.
// autoCodeSplitting disabled to prevent babel-dead-code-elimination
// from injecting a duplicate "hot" binding alongside the React HMR plugin.
export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: false }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 5173,
    host: true,
  },
});
