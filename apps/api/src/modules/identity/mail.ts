import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { AuthConfig } from './config.js';

export interface AuthMessage { kind: 'verification' | 'password_reset'; to: string; url: string }
export type AuthMailer = (message: AuthMessage) => Promise<void>;

export function createAuthMailer(config: AuthConfig, fetcher: typeof fetch = fetch): AuthMailer {
  if (config.mailMode === 'local') return async message => {
    const directory = resolve('.local/auth-mailbox');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, randomUUID() + '.json'), JSON.stringify({ ...message, createdAt: new Date().toISOString(), delivery: 'local_development_only' }), { mode: 0o600, flag: 'wx' });
    // Links/tokens and recipient addresses are never logged or served by the API.
  };
  if (config.mailMode === 'brevo') return async message => {
    try {
      const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'api-key': config.brevoApiKey!, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'Newbert AI Video', email: config.mailFrom },
          to: [{ email: message.to }],
          subject: message.kind === 'verification' ? 'Verify your Newbert account' : 'Reset your Newbert password',
          textContent: `${message.kind === 'verification' ? 'Verify your email address' : 'Reset your password'}:\n\n${message.url}\n\nIf you did not request this, you can ignore this message.` }),
      });
      await response.body?.cancel();
      if (response.status !== 201) throw new Error('Email rejected');
    } catch { throw new Error('Authentication email delivery unavailable.'); }
  };
  const options: SMTPTransport.Options = { url: config.smtpUrl!, requireTLS: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 };
  const transport = nodemailer.createTransport(options);
  return async message => {
    await transport.sendMail({ from: config.mailFrom!, to: message.to,
      subject: message.kind === 'verification' ? 'Verify your Newbert account' : 'Reset your Newbert password',
      text: `${message.kind === 'verification' ? 'Verify your email address' : 'Reset your password'}:\n\n${message.url}\n\nIf you did not request this, you can ignore this message.` });
  };
}
