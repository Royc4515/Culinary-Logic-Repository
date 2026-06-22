import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Frontend host only.
 *
 * In development this runs the Vite dev server as middleware; in production it
 * serves the built SPA from `dist/`. It does NOT implement any API — all backend
 * logic (Telegram webhook, LLM extraction, scraping, Google Places enrichment,
 * Supabase writes) lives in the Python/Flask service under `backend/` (deployed
 * separately, see `backend/render.yaml`). The frontend reaches it via
 * `VITE_BACKEND_URL`.
 */
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    // Development: serve the app through Vite's middleware (HMR, etc.).
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the static build and fall back to index.html for SPA routing.
    const distPath = process.cwd() + '/dist';
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(distPath + '/index.html');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
