import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { Store } from '../lib/store.mjs';
import { temporaryFolder } from './helpers.mjs';
async function app(t) {
  const dir = await temporaryFolder(t, 'server-');
  const { server, store } = await createApp({ dataDir: dir, worker: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); });
  async function request(path, method = 'GET', data, cookie) { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }); return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], data: await r.json() }; }
  async function register(email) { return (await request('/api/auth/register', 'POST', { name: 'Test Creator', email, password: 'a-long-test-password' })).cookie; }
  return { request, register, store, base };
}
test('protected endpoints require authentication', async t => { const { request } = await app(t); assert.equal((await request('/api/projects')).status, 401); });
test('accounts own isolated projects and export/media permissions', async t => {
  const { request, register } = await app(t), one = await register('one@example.com'), two = await register('two@example.com');
  const p = (await request('/api/projects', 'POST', { sample: true }, one)).data.project;
  assert.equal((await request('/api/projects', 'GET', null, two)).data.projects.length, 0);
  assert.equal((await request(`/api/projects/${p.id}/export`, 'GET', null, two)).status, 404);
  assert.equal((await request(`/api/projects/${p.id}/video`, 'GET', null, two)).status, 404);
  assert.equal((await request(`/api/projects/${p.id}`, 'PATCH', { revision: p.revision, scenes: p.scenes }, two)).status, 404);
  assert.equal((await request(`/api/projects/${p.id}/export`, 'GET', null, one)).status, 200);
});
test('stale scene edits cannot overwrite a newer revision', async t => {
  const { request, register } = await app(t), cookie = await register('creator@example.com');
  const p = (await request('/api/projects', 'POST', { sample: true }, cookie)).data.project;
  assert.equal((await request(`/api/projects/${p.id}`, 'PATCH', { revision: 1, scenes: p.scenes }, cookie)).status, 200);
  assert.equal((await request(`/api/projects/${p.id}`, 'PATCH', { revision: 1, scenes: p.scenes }, cookie)).status, 409);
});
test('visual edits reuse narration while spoken edits invalidate it', async t => {
  const { request, register, store } = await app(t), cookie = await register('revisions@example.com');
  const p = (await request('/api/projects', 'POST', { sample: true }, cookie)).data.project;
  await store.update(db => { db.projects.find(x => x.id === p.id).audio = { revision: 1, directory: 'saved-audio', timeline: p.scenes.map(s => ({ ...s, start: 0, end: 5, captions: [] })) }; });
  p.scenes[0].title = 'A larger explanation';
  const visual = (await request(`/api/projects/${p.id}`, 'PATCH', { revision: 1, scenes: p.scenes }, cookie)).data.project;
  assert.equal(visual.audio.revision, visual.revision); assert.equal(visual.audio.directory, 'saved-audio'); assert.equal(visual.audio.timeline[0].title, 'A larger explanation');
  visual.scenes[0].narration += ' This changes the spoken content.';
  const spoken = (await request(`/api/projects/${p.id}`, 'PATCH', { revision: 2, scenes: visual.scenes }, cookie)).data.project;
  assert.notEqual(spoken.audio.revision, spoken.revision);
});
test('CSRF origin checks reject cross-site mutation', async t => {
  const { base } = await app(t);
  const response = await fetch(base + '/api/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}' }); assert.equal(response.status, 403);
});
test('demo users cannot consume live provider credits', async t => { const { request } = await app(t); const { cookie } = await request('/api/auth/demo', 'POST', {}); const p = (await request('/api/projects', 'POST', { sample: true }, cookie)).data.project; assert.equal((await request(`/api/projects/${p.id}/generate`, 'POST', { reviewed: true }, cookie)).status, 422); });
test('logout invalidates persisted session', async t => { const { request, register } = await app(t), cookie = await register('out@example.com'); await request('/api/logout', 'POST', {}, cookie); assert.equal((await request('/api/projects', 'GET', null, cookie)).status, 401); });
test('saved projects survive store reopening and failed updates roll back', async t => {
  const { store } = await app(t); await store.update(db => { db.projects.push({ id: 'saved', ownerId: 'one' }); });
  await assert.rejects(store.update(db => { db.projects.push({ id: 'invalid' }); throw new Error('failure'); }));
  const reopened = new Store(store.root); await reopened.init(); assert.deepEqual(reopened.data.projects, [{ id: 'saved', ownerId: 'one' }]); assert.equal(store.data.projects.length, 1);
});
test('duplicate in-flight requests return the existing job', async t => {
  const { request, register, store } = await app(t), cookie = await register('jobs@example.com');
  const p = (await request('/api/projects', 'POST', { sample: true }, cookie)).data.project;
  await store.update(db => { db.jobs.push({ id: 'existing-job', projectId: p.id, ownerId: p.ownerId, state: 'queued' }); });
  const response = await request(`/api/projects/${p.id}/generate`, 'POST', {}, cookie); assert.equal(response.data.job.id, 'existing-job'); assert.equal(store.data.jobs.length, 1);
});
