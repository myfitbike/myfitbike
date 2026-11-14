import 'dotenv/config';
export const env = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/veloworld',
  testDatabaseUrl: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/veloworld_test',
};
