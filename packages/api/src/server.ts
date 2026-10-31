/**
 * GuardianStream API server.
 *
 * Express server with:
 * - Hash-prefix filter lookups (k-anonymity)
 * - Filter set submission
 * - Segment voting
 * - Taxonomy browsing + packs
 * - Seed data for development
 */

import express from 'express';
import cors from 'cors';
import { filterRouter } from './routes/filters.js';
import { voteRouter } from './routes/votes.js';
import { taxonomyRouter } from './routes/taxonomy.js';
import { initDb, closeDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3100', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/v1/filters', filterRouter);
app.use('/api/v1/votes', voteRouter);
app.use('/api/v1/taxonomy', taxonomyRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Initialize and start
async function start() {
  const db = await initDb();
  await seedDatabase(db);

  const server = app.listen(PORT, () => {
    console.log(`[GuardianStream API] Running on http://localhost:${PORT}`);
    console.log(`[GuardianStream API] Filter lookup: GET /api/v1/filters/:hashPrefix`);
  });

  process.on('SIGINT', async () => {
    console.log('\n[GuardianStream API] Shutting down...');
    server.close();
    await closeDb();
    process.exit(0);
  });
}

start().catch((err) => {
  console.error('[GuardianStream API] Failed to start:', err);
  process.exit(1);
});
