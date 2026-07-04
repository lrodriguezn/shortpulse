/**
 * Vite config — React plugin + path alias + Vitest (jsdom).
 *
 * `@vitejs/plugin-react` enables Fast Refresh + the automatic JSX
 * runtime. The `@/` alias mirrors the `tsconfig.json` paths so
 * imports like `@/components/ui/button` resolve identically from
 * dev server, build, and tests.
 *
 * `tsconfigPaths()` is NOT used: Vite's `resolve.alias` is enough
 * and avoids a third-party plugin dependency. We keep `@shortpulse/shared`
 * pointing at the workspace source so HMR picks up shared schema
 * changes without rebuilding the shared `dist/`.
 *
 * Dev proxy: Vite proxies /api/*, /health, and short-slug redirects
 * to the Fastify backend so the SPA and API share the same origin.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendPort = process.env.PORT ?? 3001;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-proxy',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '/';
          // Proxy API routes and health check unconditionally
          if (url.startsWith('/api/') || url === '/health') {
            const target = `http://localhost:${backendPort}`;
            const proxyReq = http.request(
              `${target}${url}`,
              { method: req.method, headers: req.headers },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
                proxyRes.pipe(res);
              },
            );
            proxyReq.on('error', () => {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
              res.end('Backend not reachable');
            });
            req.pipe(proxyReq);
            return;
          }
          // Proxy short-slug redirects (3-20 alphanumeric/underscore/dash)
          // but skip known SPA routes and static assets
          const slugMatch = url.match(/^\/([a-zA-Z0-9_-]{3,20})(\/.*)?$/);
          if (slugMatch) {
            const slug = slugMatch[1];
            const spaRoutes = ['links', 'analytics', 'health', 'api'];
            if (!spaRoutes.includes(slug) && !slug.includes('.')) {
              const target = `http://localhost:${backendPort}`;
              const proxyReq = http.request(
                `${target}${url}`,
                { method: req.method, headers: req.headers },
                (proxyRes) => {
                  res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
                  proxyRes.pipe(res);
                },
              );
              proxyReq.on('error', () => {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Backend not reachable');
              });
              req.pipe(proxyReq);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@shortpulse/shared': path.resolve(here, '../shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
