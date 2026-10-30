import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthConfig } from '../../apps/api/src/modules/identity/config.js';

test('SMTP configuration cannot override required TLS or certificate validation', () => {
  const env = {
    AUTH_DATABASE_URL: 'postgresql://localhost/test', BETTER_AUTH_SECRET: 'x'.repeat(40),
    AUTH_BASE_URL: 'https://app.example.test', APP_ORIGIN: 'https://app.example.test',
    NODE_ENV: 'production', AUTH_MAIL_MODE: 'smtp', AUTH_MAIL_FROM: 'accounts@example.test'
  };
  for (const url of ['smtp://user:pass@mail.example.test:587', 'smtps://mail.example.test:465']) {
    assert.equal(readAuthConfig({ ...env, SMTP_URL: url })?.smtpUrl, url);
  }
  for (const url of [
    'smtp://mail.example.test?requireTLS=false', 'smtp://mail.example.test?ignoreTLS=true',
    'smtps://mail.example.test?tls.rejectUnauthorized=false', 'https://mail.example.test',
    'smtp://mail.example.test/path', 'smtp://mail.example.test#options'
  ]) assert.throws(() => readAuthConfig({ ...env, SMTP_URL: url }), /SMTP_URL/);
});
