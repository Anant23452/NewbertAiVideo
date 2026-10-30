import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { PostgresDialect } from 'kysely';
import pg from 'pg';
import type { AuthConfig } from './config.js';
import type { AuthMailer } from './mail.js';

export function createIdentityPool(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  pool.on('error', () => console.error('Identity database connection failed; credentials are redacted.'));
  return pool;
}

export function identityOptions(pool: pg.Pool, config: AuthConfig, mail: AuthMailer, authLimit = 5): BetterAuthOptions {
  return {
    appName: 'Newbert AI Video', baseURL: config.baseUrl, basePath: '/api/auth', secret: config.secret,
    trustedOrigins: [config.origin],
    database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: 'auth', transaction: true },
    logger: { disabled: true }, telemetry: { enabled: false },
    // Propagate unexpected faults to Fastify's sanitized error boundary instead
    // of better-call's fallback console logger (which can print DB row details).
    onAPIError: { throw: true },
    emailAndPassword: { enabled: true, requireEmailVerification: true, autoSignIn: false, minPasswordLength: 12, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => mail({ kind: 'password_reset', to: user.email, url }) },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => mail({ kind: 'verification', to: user.email, url }) },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 15, cookieCache: { enabled: false }, deferSessionRefresh: true },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: authLimit }, '/sign-up/email': { window: 60, max: authLimit }, '/request-password-reset': { window: 60, max: authLimit }, '/send-verification-email': { window: 60, max: authLimit } } },
    advanced: { useSecureCookies: new URL(config.baseUrl).protocol === 'https:',
      cookies: { session_token: { name: 'newbert_session', attributes: { httpOnly: true, sameSite: 'lax', path: '/', secure: new URL(config.baseUrl).protocol === 'https:' } } },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' }, ipAddress: { ipAddressHeaders: ['x-real-ip'] } },
  };
}

export function createIdentityService(pool: pg.Pool, config: AuthConfig, mail: AuthMailer, authLimit = 5) {
  return betterAuth(identityOptions(pool, config, mail, authLimit));
}
export type IdentityService = ReturnType<typeof createIdentityService>;

export async function identityDatabaseState(pool: pg.Pool): Promise<'connected' | 'unsafe_role' | 'unavailable'> {
  try {
    const { rows } = await pool.query<{ unsafe: boolean; ready: boolean }>(`SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole
      OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('auth','newbert') AND n.nspowner=r.oid) AS unsafe,
      pg_has_role(current_user,'newbert_identity','member') AND to_regclass('auth.workspace_binding') IS NOT NULL AS ready
      FROM pg_roles r WHERE rolname=current_user`);
    if (rows[0]?.unsafe) return 'unsafe_role';
    return rows[0]?.ready ? 'connected' : 'unavailable';
  } catch { return 'unavailable'; }
}
