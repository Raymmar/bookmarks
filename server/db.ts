import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * Creates the production database connection.
 */
export function createProdDbConnection(): Db {
  neonConfig.webSocketConstructor = ws;

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle({ client: pool, schema });
}

/**
 * Type of the database connection.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;