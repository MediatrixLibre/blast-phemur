/**
 * Voting routes.
 *
 * POST /api/v1/votes  -- vote on a segment
 */

import { Router, type Router as ExpressRouter } from 'express';
import { getDb } from '../db/database.js';

export const voteRouter: ExpressRouter = Router();

/**
 * POST /api/v1/votes
 * Body: { segmentId, userId, direction: 1 | -1 }
 */
voteRouter.post('/', async (req, res) => {
  const { segmentId, userId, direction } = req.body;

  if (!segmentId || !userId || ![-1, 1].includes(direction)) {
    res.status(400).json({ error: 'Missing segmentId, userId, or invalid direction' });
    return;
  }

  const db = getDb();

  await db.run(
    `INSERT INTO votes (segment_id, user_id, direction)
     VALUES (?, ?, ?)
     ON CONFLICT(segment_id, user_id) DO UPDATE SET
       direction = EXCLUDED.direction,
       created_at = EXCLUDED.created_at`,
    segmentId, userId, direction,
  );

  const result = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(direction), 0) as total
     FROM votes WHERE segment_id = ?`,
    segmentId,
  );

  res.json({ status: 'ok', segmentId, totalVotes: result?.total ?? 0 });
});
