export interface AuthConfig {
  databaseUrl: string;
  secret: string;
  baseUrl: string;
  origin: string;
  production: boolean;
  mailMode: 'local' | 'smtp';
  smtpUrl?: string;
  mailFrom?: string;
}

export function readAuthConfig(env = process.env): AuthConfig | undefined {
  if (!env.AUTH_DATABASE_URL && !env.BETTER_AUTH_SECRET) {
    if(env.NODE_ENV==='production')throw new Error('Production requires identity configuration.');
    return undefined;
  }
  if (!env.AUTH_DATABASE_URL || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error('Auth database and a secret of at least 32 characters are required.');
  const base = new URL(env.AUTH_BASE_URL || 'http://127.0.0.1:3100');
  const origin = new URL(env.APP_ORIGIN || base.origin);
  const production = env.NODE_ENV === 'production';
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Auth URLs must be plain trusted origins.');
  if (!['http:', 'https:'].includes(base.protocol) || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Auth URLs must use HTTP or HTTPS.');
  const local = (url: URL) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((base.protocol==='http:'&&!local(base)) || (origin.protocol==='http:'&&!local(origin))) throw new Error('Plain HTTP auth is limited to loopback development.');
  if (production && (base.protocol !== 'https:' || origin.protocol !== 'https:')) throw new Error('Production authentication requires HTTPS.');
  const mailMode = env.AUTH_MAIL_MODE || (production ? 'smtp' : 'local');
  if (mailMode !== 'smtp' && mailMode !== 'local') throw new Error('Choose local or SMTP auth mail delivery.');
  if (mailMode === 'local' && (production || !local(base) || !local(origin))) throw new Error('Local auth mail is limited to loopback development.');
  if (mailMode === 'smtp' && (!env.SMTP_URL || !env.AUTH_MAIL_FROM || /[\r\n]/.test(env.AUTH_MAIL_FROM))) throw new Error('SMTP delivery needs a transport URL and sender.');
  if (mailMode === 'smtp') {
    const smtp = new URL(env.SMTP_URL!);
    // Nodemailer merges URL query options after transport options. Forbid
    // overrides such as ignoreTLS or tls.rejectUnauthorized in this boundary.
    if (!['smtp:', 'smtps:'].includes(smtp.protocol) || !smtp.hostname || smtp.search || smtp.hash || (smtp.pathname && smtp.pathname !== '/')) {
      throw new Error('SMTP_URL must be an SMTP or SMTPS connection URL without paths, query options or fragments.');
    }
  }
  return { databaseUrl: env.AUTH_DATABASE_URL, secret: env.BETTER_AUTH_SECRET, baseUrl: base.origin, origin: origin.origin, production, mailMode,
    ...(env.SMTP_URL ? { smtpUrl: env.SMTP_URL } : {}), ...(env.AUTH_MAIL_FROM ? { mailFrom: env.AUTH_MAIL_FROM } : {}) };
}
