/**
 * Filter routes -- hash-prefix lookups + submissions.
 *
 * GET  /api/v1/filters/:hashPrefix  -- k-anonymity lookup
 * POST /api/v1/filters/submit       -- submit new filter set
 */

import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db/database.js';

export const filterRouter: ExpressRouter = Router();

/**
 * GET /api/v1/filters/:hashPrefix
 *
 * Returns all filter sets whose content_id starts with the given prefix.
 * The client sends only the first 4 characters of the SHA-256 hash,
 * so the server cannot determine which specific title is being requested.
 */
filterRouter.get('/:hashPrefix', async (req, res) => {
  const prefix = req.params.hashPrefix;

  if (!/^[a-f0-9]{4,8}$/i.test(prefix)) {
    res.status(400).json({ error: 'Hash prefix must be 4-8 hex characters' });
    return;
  }

  const db = getDb();
  const rows = await db.all<{
    content_id: string;
    title: string;
    provider: string;
    provider_content_id: string;
    duration: number;
    segments_json: string;
    coverage_json: string;
  }>(
    `SELECT content_id, title, provider, provider_content_id,
            duration, segments_json, coverage_json
     FROM filter_sets
     WHERE content_id LIKE ? || '%'`,
    prefix,
  );

  const results = rows.map((row) => ({
    version: '2.0' as const,
    contentId: row.content_id,
    title: row.title,
    provider: row.provider,
    providerContentId: row.provider_content_id,
    duration: row.duration,
    segments: JSON.parse(row.segments_json),
    coverage: JSON.parse(row.coverage_json),
  }));

  res.json(results);
});

/**
 * POST /api/v1/filters/submit
 *
 * Submit a new or updated filter set.
 */
filterRouter.post('/submit', async (req, res) => {
  const body = req.body;

  if (!body?.contentId || !body?.segments || !body?.provider) {
    res.status(400).json({ error: 'Missing required fields: contentId, segments, provider' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO filter_sets (content_id, title, provider, provider_content_id,
                              duration, segments_json, coverage_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(content_id) DO UPDATE SET
       segments_json = EXCLUDED.segments_json,
       coverage_json = EXCLUDED.coverage_json,
       updated_at = EXCLUDED.updated_at`,
    body.contentId,
    body.title ?? 'Unknown',
    body.provider,
    body.providerContentId ?? '',
    body.duration ?? 0,
    JSON.stringify(body.segments),
    JSON.stringify(body.coverage ?? {}),
    now,
  );

  res.status(201).json({ status: 'ok', contentId: body.contentId });
});
