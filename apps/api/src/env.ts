import 'dotenv/config';
export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/veloworld',
  stravaClientId: process.env.STRAVA_CLIENT_ID ?? '',
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET ?? '',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  webBase: process.env.WEB_BASE ?? 'http://localhost:5173',
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/veloworld_test',
};
