/**
 * Taxonomy routes -- category browsing and pack management.
 *
 * GET  /api/v1/taxonomy/categories   -- list all canonical categories
 * GET  /api/v1/taxonomy/packs        -- list category packs
 * GET  /api/v1/taxonomy/packs/:id    -- get a specific pack
 */

import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db/database.js';

export const taxonomyRouter: ExpressRouter = Router();

/** GET /api/v1/taxonomy/categories */
taxonomyRouter.get('/categories', async (_req, res) => {
  const db = getDb();
  const rows = await db.all(
    `SELECT * FROM taxonomy_categories
     WHERE status = 'active'
     ORDER BY layer ASC, id ASC`,
  );
  res.json(rows);
});

/** GET /api/v1/taxonomy/packs */
taxonomyRouter.get('/packs', async (_req, res) => {
  const db = getDb();
  const rows = await db.all<{ tags_json: string; [key: string]: unknown }>(
    `SELECT id, name, description, author, subscribers, rating, tags_json
     FROM category_packs
     ORDER BY subscribers DESC`,
  );

  const results = rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags_json),
  }));

  res.json(results);
});

/** GET /api/v1/taxonomy/packs/:id */
taxonomyRouter.get('/packs/:id', async (req, res) => {
  const db = getDb();
  const row = await db.get<{ categories_json: string; tags_json: string; [key: string]: unknown }>(
    `SELECT * FROM category_packs WHERE id = ?`,
    req.params.id,
  );

  if (!row) {
    res.status(404).json({ error: 'Pack not found' });
    return;
  }

  res.json({
    ...row,
    categories: JSON.parse(row.categories_json),
    tags: JSON.parse(row.tags_json),
  });
});
