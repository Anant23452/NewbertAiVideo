import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { plan, speech } from './providers.mjs';
import { buildTimeline } from './domain.mjs';
import { audioDuration, render, encoder } from './render.mjs';

export class Worker {
  constructor(store) { this.store = store; this.busy = false; }
  async recover() {
    await this.store.update(db => {
      for (const job of db.jobs.filter(j => j.state === 'running')) {
        job.state = 'failed'; job.error = job.stage === 'generating_voice' ? 'The server restarted during a speech request. Check provider usage before trying again; it may have completed there.' : 'The server restarted. Saved artifacts are preserved; retry this project.';
      }
    });
    this.timer = setInterval(() => this.tick().catch(() => {}), 1000); this.timer.unref(); this.tick();
  }
  async state(id, stage) { return this.store.update(db => { const j = db.jobs.find(j => j.id === id); if (j.state === 'cancelled') throw new Error('Cancelled'); j.stage = stage; j.updatedAt = new Date().toISOString(); }); }
  async tick() {
    if (this.busy) return;
    const job = this.store.data.jobs.find(j => j.state === 'queued'); if (!job) return;
    this.busy = true;
    try {
      await this.store.update(db => { db.jobs.find(j => j.id === job.id).state = 'running'; });
      const p = structuredClone(this.store.data.projects.find(p => p.id === job.projectId));
      if (job.kind === 'plan') {
        await this.state(job.id, 'scripting');
        const result = await plan(p);
        await this.state(job.id, 'checking');
        await this.store.update(db => { const target = db.projects.find(x => x.id === p.id); target.scenes = result.scenes; target.reviewNotes = result.reviewNotes; target.plannerModel = result.model; target.status = 'storyboard'; target.revision++; target.updatedAt = new Date().toISOString(); });
      } else {
        const dir = join(this.store.root, 'media', p.id, job.id); await mkdir(dir, { recursive: true });
        let audio = p.audio?.revision === p.revision && p.audio.voiceId === job.voiceId ? p.audio : null;
        if (audio) await copyFile(join(this.store.root, 'media', p.id, audio.directory, 'audio.mp3'), join(dir, 'audio.mp3'));
        if (!audio) {
          let alignment;
          if (p.speechSource?.revision === p.revision && p.speechSource.voiceId === job.voiceId) {
            await copyFile(join(this.store.root, 'media', p.id, p.speechSource.directory, 'audio.mp3'), join(dir, 'audio.mp3'));
            alignment = JSON.parse(await readFile(join(this.store.root, 'media', p.id, p.speechSource.directory, 'alignment.json'), 'utf8'));
          } else {
            await this.state(job.id, 'generating_voice');
            const result = await speech(p.scenes, job.voiceId);
            if (typeof result.audio_base64 !== 'string') throw new Error('The speech provider returned no audio.');
            await writeFile(join(dir, 'audio.mp3'), Buffer.from(result.audio_base64, 'base64'));
            await writeFile(join(dir, 'alignment.json'), JSON.stringify(result.alignment));
            alignment = result.alignment;
            await this.store.update(db => { db.projects.find(x => x.id === p.id).speechSource = { revision: p.revision, voiceId: job.voiceId, directory: job.id }; });
          }
          await this.state(job.id, 'aligning');
          if (!encoder()) throw new Error('Speech is saved, but FFmpeg is required to measure and render it. Configure the encoder before continuing.');
          const duration = await audioDuration(dir);
          if (duration > Number(process.env.MAX_AUDIO_SECONDS || 180)) throw new Error('Narration exceeds the pilot duration limit. Shorten the storyboard.');
          const timeline = buildTimeline(p.scenes, alignment, duration);
          audio = { revision: p.revision, duration, timeline, voiceId: job.voiceId, directory: job.id };
          await this.store.update(db => { db.projects.find(x => x.id === p.id).audio = audio; });
        }
        await this.state(job.id, 'rendering');
        await render(dir, audio.timeline, audio.duration);
        await this.state(job.id, 'checking');
        await this.store.update(db => { if (db.jobs.find(j => j.id === job.id).state === 'cancelled') return; const target = db.projects.find(x => x.id === p.id); if (target.output) target.previousOutputs = [...(target.previousOutputs || []), target.output].slice(-5); target.output = { revision: p.revision, duration: audio.duration, directory: job.id, createdAt: new Date().toISOString() }; target.status = 'ready'; });
      }
      await this.store.update(db => { const j = db.jobs.find(j => j.id === job.id); if (j.state !== 'cancelled') { j.state = 'succeeded'; j.stage = 'complete'; j.completedAt = new Date().toISOString(); } });
    } catch (error) {
      await this.store.update(db => { const j = db.jobs.find(j => j.id === job.id); if (j.state !== 'cancelled') { j.state = 'failed'; j.error = error.name === 'TimeoutError' ? 'The provider timed out. Check its request history before retrying narration to avoid duplicate charges.' : error.message; } });
    } finally { this.busy = false; }
  }
}
