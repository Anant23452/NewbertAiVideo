import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { encoder, audioDuration, render } from '../lib/render.mjs';
import { temporaryFolder } from './helpers.mjs';
test('real encoder creates and validates an MP4 with an audio-timed composition', { skip: !encoder(), timeout: 120000 }, async t => {
  const dir = await temporaryFolder(t, 'render-');
  await promisify(execFile)(encoder(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libmp3lame', join(dir, 'audio.mp3')], { windowsHide: true });
  const duration = await audioDuration(dir); assert.ok(duration >= 2 && duration < 2.2);
  await render(dir, [{ title: 'समझो / Learn', kind: 'comparison', labels: ['RAM', 'Storage'], start: 0, end: duration, captions: [{ text: 'Test captions / परीक्षण', start: .1, end: 1.8 }] }], duration);
  assert.ok((await stat(join(dir, 'video.mp4'))).size > 10000);
});
