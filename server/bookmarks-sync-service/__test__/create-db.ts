import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { normalize } from 'path';
import * as schema from '@shared/schema';
import tmp from 'tmp';
import { execSync } from 'child_process';
import fse from 'fs-extra';

tmp.setGracefulCleanup();

/**
 * Create a temporary database for testing using PGlite and drizzle.
 */
export async function createDb() {
  const { name: tmpDirPath } = tmp.dirSync({ unsafeCleanup: true });

  // Generate migrations to create the database schema
  const repoRootDir = normalize(`${import.meta.dirname}/../../..`);
  const migrationsFolder = normalize(`${tmpDirPath}/migrations`);

  // Ideally we would be able to execute `drizzle-kit generate` to generate the
  // initial schema, but that currently must be generated from a live database 
  // rather than our in-memory PGlite database. So instead we're manually 
  // generating the SQL statements as if we were going to send them to another 
  // tool, but then store/run it as a drizzle migration instead.
  const sql = execSync('npx drizzle-kit export', { 
    cwd: repoRootDir,
    env: {
      ...process.env,

      // if not defined, we'll just set to nothing. This env var is simply 
      // needed to pass the check in the drizzle.config.ts file for its 
      // existence, but isn't actually used for 'drizzle-kit export'
      DATABASE_URL: process.env.DATABASE_URL ?? '<none>',
    },
    encoding: 'utf8',
  });
  const migrationSql = sql.replace(/;/g, `;\n--> statement-breakpoint`); // there must be a '--> statement-breakpoint' line between each SQL statement

  fse.outputFileSync(normalize(`${tmpDirPath}/migrations/0000_init.sql`), migrationSql, 'utf8');
  fse.outputJsonSync(
    normalize(`${tmpDirPath}/migrations/meta/_journal.json`),
    {
      version: '7',
      dialect: 'postgresql',
      entries: [
        {
          idx: 0,
          version: '7',
          when: 1680271923328,
          tag: '0000_init',
          breakpoints: false,
        },
      ],
    },
    'utf8'
  );

  // Create the db and run the 'migrations' to create the initial schema
  const db = drizzle({ schema });
  await migrate(db, { migrationsFolder });

  return db;
}
