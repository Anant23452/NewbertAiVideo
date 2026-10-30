import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

// Local-only helper: links remain out of API responses and terminal output.
const email = process.argv[2];
const kind = process.argv.includes('--reset') ? 'password_reset' : 'verification';
if (!email || process.env.AUTH_MAIL_MODE !== 'local') {
  console.error('Use local mail mode, then: npm run auth:mail -- your@email.example [--reset] [--open]');
  process.exit(1);
}
const directory = resolve('.local/auth-mailbox');
const messages = [];
for (const name of await readdir(directory).catch(() => [])) {
  if (!name.endsWith('.json')) continue;
  const message = JSON.parse(await readFile(resolve(directory, name), 'utf8'));
  if (message.to === email && message.kind === kind) messages.push({ ...message, name });
}
messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const latest = messages[0];
if (!latest) { console.error('No matching local message found. Request a new link in the app.'); process.exit(1); }
const url = new URL(latest.url);
if (url.origin !== process.env.APP_ORIGIN || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
  console.error('The message does not point to the configured local app. Request a new link.'); process.exit(1);
}
if (!process.argv.includes('--open')) {
  console.log('Latest local email file: ' + resolve(directory, latest.name));
} else if (process.platform === 'win32') {
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process -FilePath $env:NEWBERT_LOCAL_MAIL_LINK'], {
    env: { ...process.env, NEWBERT_LOCAL_MAIL_LINK: url.href }, windowsHide: true, stdio: 'ignore',
  });
  child.on('error', () => { console.error('Could not open browser. Run without --open to locate the message.'); process.exitCode = 1; });
  child.on('exit', code => { if (code) process.exitCode = 1; else console.log('Local email link opened in your browser.'); });
} else {
  console.error('Open the local email file manually on this operating system: ' + resolve(directory, latest.name));
  process.exitCode = 1;
}
