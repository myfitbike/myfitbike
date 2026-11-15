import 'dotenv/config';
export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/myfitbike',
  stravaClientId: process.env.STRAVA_CLIENT_ID ?? '',
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET ?? '',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  webBase: process.env.WEB_BASE ?? 'http://localhost:5173',
  /** Supabase project URL (https://<ref>.supabase.co). When set, every request needs a signed-in rider (PLAN 17.2). */
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  /** Optional invite list (comma-separated e-mails); empty = open sign-up. */
  allowedEmails: (process.env.ALLOWED_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Local installs: the first account to sign in takes over the existing profile (default on; off in production). */
  claimLocalProfile: (process.env.CLAIM_LOCAL_PROFILE ?? 'true') === 'true',
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/myfitbike_test',
};
