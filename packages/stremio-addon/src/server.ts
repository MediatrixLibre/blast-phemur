/**
 * GuardianStream Stremio Addon -- HTTP Server.
 *
 * Implements the Stremio addon protocol as a plain Express server.
 * Endpoints:
 *   GET /manifest.json          -- Addon manifest
 *   GET /catalog/:type/:id.json -- Browsable catalog
 *   GET /subtitles/:type/:id.json -- Subtitle tracks for a title
 *   GET /vtt/:imdbId.vtt        -- Actual VTT filter file
 */

import express from 'express';
import cors from 'cors';
import { MANIFEST } from './addon.js';
import { getCatalog } from './handlers/catalog.js';
import { getSubtitles, getVTTContent } from './handlers/subtitles.js';
import { getTitleCount } from './lib/imdb-map.js';

const app = express();
app.use(cors());

const PORT = Number(process.env.PORT ?? 7777);

// Determine the public base URL for self-referencing (VTT file URLs)
function getBaseUrl(req: express.Request): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
  const host = req.headers['x-forwarded-host'] ?? req.get('host');
  return `${protocol}://${host}`;
}

// --- Stremio Addon Protocol Endpoints ---

/** Manifest */
app.get('/manifest.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(MANIFEST);
});

/** Catalog -- browsable list of titles with filter data */
app.get('/catalog/:type/:id.json', (req, res) => {
  const { type } = req.params;
  const search = req.query.search as string | undefined;
  const skip = req.query.skip ? Number(req.query.skip) : undefined;

  const result = getCatalog(type, { search, skip });
  res.json(result);
});

/** Catalog with extra path segment (Stremio sends /catalog/movie/id/search=foo.json) */
app.get('/catalog/:type/:id/:extra.json', (req, res) => {
  const { type, extra } = req.params;

  // Parse Stremio's extra format: "search=query" or "skip=20"
  const parsed: Record<string, string> = {};
  if (extra) {
    for (const part of extra.split('&')) {
      const [key, value] = part.split('=');
      if (key && value) parsed[key] = decodeURIComponent(value);
    }
  }

  const result = getCatalog(type, {
    search: parsed['search'],
    skip: parsed['skip'] ? Number(parsed['skip']) : undefined,
  });
  res.json(result);
});

/** Subtitles -- returns subtitle track references for a title */
app.get('/subtitles/:type/:id.json', (req, res) => {
  const { id } = req.params;
  // Stremio sends ID as "tt0111161" for movies or "tt0111161:1:2" for series (season:episode)
  const imdbId = id.split(':')[0];
  const baseUrl = getBaseUrl(req);

  const result = getSubtitles(imdbId, baseUrl);
  res.json(result);
});

/** VTT file endpoint -- serves the actual WebVTT filter track */
app.get('/vtt/:imdbId.vtt', async (req, res) => {
  const { imdbId } = req.params;
  const filterLevel = (req.query.level as string) ?? 'moderate';

  const vtt = await getVTTContent(imdbId, filterLevel);
  if (!vtt) {
    res.status(404).send('No filter data available');
    return;
  }

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(vtt);
});

// --- Health / Info ---

app.get('/', (_req, res) => {
  res.json({
    name: MANIFEST.name,
    version: MANIFEST.version,
    titles: getTitleCount(),
    install: 'Add this addon to Stremio using the manifest URL',
    manifestUrl: '/manifest.json',
  });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`GuardianStream Stremio Addon running on port ${PORT}`);
  console.log(`Manifest: http://localhost:${PORT}/manifest.json`);
  console.log(`Titles available: ${getTitleCount()}`);
  console.log('');
  console.log('To install in Stremio:');
  console.log(`  1. Open Stremio > Addons > Community`);
  console.log(`  2. Enter: http://localhost:${PORT}/manifest.json`);
});
