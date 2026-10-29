import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scrypt as rawScrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Store } from './lib/store.mjs';
import { AppError, brief, validateScenes, cleanText, scriptFor } from './lib/domain.mjs';
import { sample } from './lib/sample.mjs';
import { Worker } from './lib/jobs.mjs';
import { voices } from './lib/providers.mjs';
import { encoder } from './lib/render.mjs';
const scrypt = promisify(rawScrypt), hash = v => createHash('sha256').update(v).digest('hex');
const root = resolve(import.meta.dirname, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, demo: !!u.demo });
async function body(req) { let size = 0, chunks = []; for await (const c of req) { size += c.length; if (size > 100000) throw new AppError('Request is too large.', 413); chunks.push(c); } try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new AppError('Request must contain valid JSON.'); } }
export async function createApp(options = {}) {
  const store = new Store(options.dataDir); await store.init();
  const worker = new Worker(store); if (options.worker !== false) await worker.recover();
  const attempts = new Map();
  const server = createServer(async (req, res) => {
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new AppError('This request came from another website.', 403);
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Cross-site requests are not allowed.', 403);
        if (!String(req.headers['content-type']).startsWith('application/json')) throw new AppError('Use a JSON request.', 415);
      }
      const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('newbert_session='))?.slice(16);
      const session = cookie && store.data.sessions.find(s => s.tokenHash === hash(cookie) && s.expires > Date.now());
      const user = session && store.data.users.find(u => u.id === session.userId);
      if (path === '/api/session' && req.method === 'GET') return json(200, { user: user ? publicUser(user) : null });
      if (path.startsWith('/api/auth/') && req.method === 'POST') {
        const key = req.socket.remoteAddress, now = Date.now(); let rate = attempts.get(key);
        if (!rate || now - rate.since > 60000) { rate = { since: now, count: 0 }; attempts.set(key, rate); }
        if (++rate.count > 12) throw new AppError('Too many sign-in attempts. Please wait a minute.', 429);
        const input = await body(req); let account;
        if (path === '/api/auth/demo') {
          account = { id: store.id(), name: 'Demo creator', email: '', demo: true };
          await store.update(db => { db.users.push(account); });
        } else if (path === '/api/auth/register') {
          const name = cleanText(input.name, 60), email = cleanText(input.email, 160).toLowerCase();
          if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('Enter your name and a valid email address.');
          if (typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 200) throw new AppError('Use a password between 10 and 200 characters.');
          const salt = randomBytes(16).toString('hex'), passwordHash = (await scrypt(input.password, salt, 64)).toString('hex');
          account = { id: store.id(), name, email, salt, passwordHash };
          await store.update(db => { if (db.users.some(u => u.email === email)) throw new AppError('An account with that email already exists.', 409); db.users.push(account); });
        } else if (path === '/api/auth/login') {
          const email = cleanText(input.email, 160).toLowerCase(); account = store.data.users.find(u => u.email === email && !u.demo);
          const candidate = await scrypt(String(input.password || '').slice(0, 200), account?.salt || 'not-a-real-account', 64);
          if (!account || !timingSafeEqual(candidate, Buffer.from(account.passwordHash, 'hex'))) throw new AppError('Email or password is incorrect.', 401);
        } else throw new AppError('Not found.', 404);
        const token = randomBytes(32).toString('hex');
        await store.update(db => { db.sessions = db.sessions.filter(s => s.expires > Date.now()); db.sessions.push({ tokenHash: hash(token), userId: account.id, expires: Date.now() + 604800000 }); });
        res.setHeader('Set-Cookie', `newbert_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.SECURE_COOKIES === 'true' ? '; Secure' : ''}`);
        return json(200, { user: publicUser(account) });
      }
      if (path.startsWith('/api/')) {
        if (!user) throw new AppError('Please sign in to your workspace.', 401);
        if (path === '/api/logout' && req.method === 'POST') { await store.update(db => { db.sessions = db.sessions.filter(s => s.tokenHash !== hash(cookie)); }); res.setHeader('Set-Cookie', 'newbert_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(200, { ok: true }); }
        if (path === '/api/config' && req.method === 'GET') return json(200, { planning: !!process.env.GEMINI_API_KEY, speech: !!process.env.ELEVENLABS_API_KEY, rendering: !!encoder(), instagram: false, dailyLimit: Number(process.env.DAILY_GENERATIONS || 3), maxSeconds: Number(process.env.MAX_AUDIO_SECONDS || 180), defaultVoice: process.env.ELEVENLABS_VOICE_ID || '', prototype: true });
        if (path === '/api/voices' && req.method === 'GET') return json(200, { voices: await voices() });
        if (path === '/api/projects' && req.method === 'GET') return json(200, { projects: store.data.projects.filter(p => p.ownerId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), jobs: store.data.jobs.filter(j => j.ownerId === user.id), usage: store.data.jobs.filter(j => j.ownerId === user.id && j.kind === 'generate' && j.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length });
        if (path === '/api/projects' && req.method === 'POST') {
          const input = await body(req), isSample = input.sample === true;
          const data = isSample ? structuredClone(sample) : brief(input);
          const project = { id: store.id(), ownerId: user.id, ...data, status: isSample ? 'storyboard' : 'draft', sample: isSample, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reviewNotes: isSample ? 'Illustrative sample. Preview timing is estimated until real narration is generated.' : 'Source retrieval is not connected in this prototype. Review factual claims before generating audio.' };
          await store.update(db => { if (db.projects.filter(p => p.ownerId === user.id).length >= 50) throw new AppError('The local pilot supports 50 projects per workspace.'); db.projects.push(project); });
          return json(201, { project });
        }
        const match = path.match(/^\/api\/projects\/([a-f0-9-]+)(?:\/(plan|generate|export|audio|video|cancel))?$/);
        if (match) {
          const [, id, action] = match; let project = store.data.projects.find(p => p.id === id && p.ownerId === user.id);
          if (!project) throw new AppError('Project not found.', 404);
          const active = store.data.jobs.find(j => j.projectId === id && ['queued', 'running'].includes(j.state));
          if (!action && req.method === 'PATCH') {
            if (active) throw new AppError('Wait for this job to finish or cancel it before editing.', 409);
            const input = await body(req); const scenes = validateScenes(input.scenes);
            await store.update(db => {
              const p = db.projects.find(p => p.id === id); if (p.revision !== input.revision) throw new AppError('This project changed in another tab. Reload before saving.', 409);
              const sameNarration = p.scenes && scriptFor(p.scenes) === scriptFor(scenes);
              p.history = [...(p.history || []), { revision: p.revision, scenes: p.scenes, audio: p.audio, output: p.output }].slice(-5);
              const previousRevision = p.revision; p.scenes = scenes; p.revision++;
              if (sameNarration && p.audio?.revision === previousRevision) p.audio = { ...p.audio, revision: p.revision, timeline: p.audio.timeline.map((timed, i) => ({ ...timed, ...scenes[i] })) };
              if (sameNarration && p.speechSource?.revision === previousRevision) p.speechSource = { ...p.speechSource, revision: p.revision };
              p.updatedAt = new Date().toISOString(); p.status = 'storyboard';
            });
            return json(200, { project: store.data.projects.find(p => p.id === id) });
          }
          if (['plan', 'generate'].includes(action) && req.method === 'POST') {
            if (active) return json(200, { job: active });
            if (user.demo) throw new AppError('Create an account to use live providers. Sample previews remain available here.', 422);
            const input = await body(req);
            if (action === 'plan' && !process.env.GEMINI_API_KEY) throw new AppError('Configure GEMINI_API_KEY in the server .env file first.', 422);
            if (action === 'generate') {
              validateScenes(project.scenes);
              if (!input.reviewed) throw new AppError('Review the script and confirm it is ready for narration.');
              if (!encoder()) throw new AppError('Install FFmpeg before starting voice generation, so paid audio can be measured and rendered.', 422);
              if (!process.env.ELEVENLABS_API_KEY || !(input.voiceId || process.env.ELEVENLABS_VOICE_ID)) throw new AppError('Connect ElevenLabs in the server settings and choose a voice.', 422);
            }
            const kind = action === 'plan' ? 'plan' : 'generate';
            const job = { id: store.id(), projectId: id, ownerId: user.id, kind, state: 'queued', stage: 'queued', revision: project.revision, voiceId: cleanText(input.voiceId || process.env.ELEVENLABS_VOICE_ID || '', 100), createdAt: new Date().toISOString() };
            await store.update(db => {
              const existing = db.jobs.find(j => j.projectId === id && ['queued', 'running'].includes(j.state)); if (existing) throw new AppError('This project already has an active job.', 409);
              const today = new Date().toISOString().slice(0, 10), count = db.jobs.filter(j => j.ownerId === user.id && j.kind === kind && j.createdAt.slice(0, 10) === today).length;
              if (count >= Number(process.env.DAILY_GENERATIONS || 3)) throw new AppError('Your daily pilot allowance for this operation has been reached.', 429);
              db.jobs.push(job);
            });
            worker.tick(); return json(202, { job });
          }
          if (action === 'cancel' && req.method === 'POST') { await store.update(db => { if (active) { const j = db.jobs.find(j => j.id === active.id); j.state = 'cancelled'; j.error = 'Cancelled. Provider work already started may still finish.'; } }); return json(200, { ok: true }); }
          if (action === 'export' && req.method === 'GET') { res.setHeader('Content-Disposition', `attachment; filename="newbert-storyboard-${id}.json"`); return json(200, { topic: project.topic, language: project.language, revision: project.revision, scenes: project.scenes || [], reviewNotes: project.reviewNotes }); }
          if (['audio', 'video'].includes(action) && req.method === 'GET') {
            const artifact = action === 'audio' ? project.audio : project.output;
            if (!artifact) throw new AppError('This media has not been generated yet.', 404);
            const file = join(store.root, 'media', id, artifact.directory, action === 'audio' ? 'audio.mp3' : 'video.mp4');
            const info = await stat(file); const contentType = action === 'audio' ? 'audio/mpeg' : 'video/mp4';
            const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Accept-Ranges', 'bytes');
            if (url.searchParams.has('download')) res.setHeader('Content-Disposition', `attachment; filename="newbert-${id}.${action === 'audio' ? 'mp3' : 'mp4'}"`);
            if (range) { const start = Number(range[1]), end = Math.min(Number(range[2] || info.size - 1), info.size - 1); if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); } res.writeHead(206, { 'Content-Type': contentType, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` }); return createReadStream(file, { start, end }).pipe(res); }
            res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': info.size }); return createReadStream(file).pipe(res);
          }
        }
        throw new AppError('Not found.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('Method not allowed.', 405);
      const allowed = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/scene.js': 'scene.js', '/favicon.svg': 'favicon.svg' };
      if (!allowed[path]) throw new AppError('Not found.', 404);
      const file = join(root, allowed[path]), data = await readFile(file);
      const ext = file.slice(file.lastIndexOf('.')); res.writeHead(200, { 'Content-Type': mime[ext] || 'image/svg+xml', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      json(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Your saved work is safe. Try again.' });
      if (!error.status) console.error(`[${new Date().toISOString()}] ${error.name}: ${error.code || 'internal error'}`);
    }
  });
  server.on('close', () => clearInterval(worker.timer)); return { server, store, worker };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { server } = await createApp(); const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Newbert AI Video is running at http://${host}:${port}`));
}
