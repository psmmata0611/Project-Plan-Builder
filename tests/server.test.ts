import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../server.ts';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const app = createApp();
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('GET /api/health returns ok', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

test('POST /api/generate-plan rejects invalid inputs with 400', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: '   ',
        startDate: '2026-11-28',
        deadlineDate: '2026-11-29',
        teamSize: 0,
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string; details: Record<string, string> };
    assert.ok(body.details.goal);
    assert.ok(body.details.teamSize);
    assert.ok(body.details.deadlineDate);
  });
});

test('POST /api/generate-plan returns explicit 503 error when GEMINI_API_KEY is unset', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Launch pilot',
          startDate: '2026-11-24',
          deadlineDate: '2026-12-22',
          teamSize: 3,
        }),
      });
      assert.equal(res.status, 503);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /GEMINI_API_KEY/);
    });
  } finally {
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});
