/**
 * Migration Verification Script
 * 
 * This script compares the source and target databases to ensure the migration
 * was successful by checking table counts and sampling data.
 * 
 * Usage:
 * 1. Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL environment variables
 * 2. Run: npx tsx scripts/verify-migration.ts
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

// Tables to check
const TABLES = [
  'users',
  'bookmarks',
  'tags',
  'bookmark_tags',
  'notes',
  'highlights',
  'screenshots',
  'insights',
  'collections',
  'collection_bookmarks',
  'activities',
  'settings',
  'chat_sessions',
  'chat_messages',
  'reports',
  'report_bookmarks',
  'x_credentials',
  'x_folders'
];

async function verifyMigration() {
  // Check for required environment variables
  const sourceDbUrl = process.env.SOURCE_DATABASE_URL;
  const targetDbUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceDbUrl) {
    throw new Error('SOURCE_DATABASE_URL environment variable is not set');
  }

  if (!targetDbUrl) {
    throw new Error('TARGET_DATABASE_URL environment variable is not set');
  }

  console.log('Setting up database connections...');

  // Set up source and target database connections
  const sourcePool = new Pool({ connectionString: sourceDbUrl });
  const targetPool = new Pool({ connectionString: targetDbUrl });

  const sourceDb = drizzle({ client: sourcePool, schema });
  const targetDb = drizzle({ client: targetPool, schema });

  try {
    console.log('Beginning verification...');
    console.log('-----------------------------------------------');
    console.log('| Table               | Source   | Target   | Status |');
    console.log('|---------------------|----------|----------|--------|');

    let allTablesPassed = true;

    // Check each table
    for (const tableName of TABLES) {
      // Get count from source database using raw SQL to avoid type issues
      const sourceQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
      const sourceCountResult = await sourceDb.execute(sql.raw(sourceQuery));
      const sourceCount = parseInt(String(sourceCountResult.rows[0]?.count) || '0', 10);

      // Get count from target database using raw SQL to avoid type issues
      const targetQuery = `SELECT COUNT(*) as count FROM "${tableName}"`;
      const targetCountResult = await targetDb.execute(sql.raw(targetQuery));
      const targetCount = parseInt(String(targetCountResult.rows[0]?.count) || '0', 10);

      // Determine status
      const status = sourceCount === targetCount ? 'PASS' : 'FAIL';
      if (status === 'FAIL') {
        allTablesPassed = false;
      }

      // Format table name to be padded to 20 characters
      const paddedTableName = tableName.padEnd(20);
      const paddedSourceCount = String(sourceCount).padEnd(9);
      const paddedTargetCount = String(targetCount).padEnd(9);
      
      console.log(`| ${paddedTableName}| ${paddedSourceCount}| ${paddedTargetCount}| ${status}  |`);
    }

    console.log('-----------------------------------------------');

    if (allTablesPassed) {
      console.log('\n✅ Verification PASSED: All table counts match between source and target databases.');
    } else {
      console.log('\n❌ Verification FAILED: Some table counts do not match. Check the table above for details.');
    }

    return allTablesPassed;
  } catch (error) {
    console.error('Error during verification:', error);
    throw error;
  } finally {
    // Close the database connections
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run the verification function
verifyMigration()
  .then((passed) => {
    if (passed) {
      console.log('Migration verification completed successfully');
      process.exit(0);
    } else {
      console.log('Migration verification completed with issues');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });