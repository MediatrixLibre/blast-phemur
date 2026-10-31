/**
 * API client for the GuardianStream server.
 * Used by the community web platform.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100';

export async function fetchFilterSets(hashPrefix: string) {
  const res = await fetch(`${API_BASE}/api/v1/filters/${hashPrefix}`);
  if (!res.ok) return [];
  return res.json();
}

export async function submitFilterSet(filterSet: unknown) {
  const res = await fetch(`${API_BASE}/api/v1/filters/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filterSet),
  });
  return res.ok;
}

export async function fetchCategories() {
  const res = await fetch(`${API_BASE}/api/v1/taxonomy/categories`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchPacks() {
  const res = await fetch(`${API_BASE}/api/v1/taxonomy/packs`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchPack(id: string) {
  const res = await fetch(`${API_BASE}/api/v1/taxonomy/packs/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function vote(segmentId: string, userId: string, direction: 1 | -1) {
  const res = await fetch(`${API_BASE}/api/v1/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segmentId, userId, direction }),
  });
  if (!res.ok) return null;
  return res.json();
}
