/**
 * Programmatic Database Migration Script
 * 
 * This script migrates data from one database to another using the Drizzle ORM.
 * This is an alternative to the pg_dump/psql approach and can be used if direct
 * database dumps are not working properly.
 * 
 * Usage:
 * 1. Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL environment variables
 * 2. Run: npx tsx scripts/migrate-data.ts
 * 
 * Note: This script requires two separate database connections and performs
 * a table-by-table copy of data.
 */

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from '../shared/schema';

// Table execution order to handle foreign key constraints
const TABLES_IN_ORDER = [
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

async function migrateData() {
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
    console.log('Beginning database migration...');

    // Get table schema mappings
    const tableMap: Record<string, any> = {
      'users': schema.users,
      'bookmarks': schema.bookmarks,
      'tags': schema.tags,
      'bookmark_tags': schema.bookmarkTags,
      'notes': schema.notes,
      'highlights': schema.highlights,
      'screenshots': schema.screenshots,
      'insights': schema.insights,
      'collections': schema.collections,
      'collection_bookmarks': schema.collectionBookmarks,
      'activities': schema.activities,
      'settings': schema.settings,
      'chat_sessions': schema.chatSessions,
      'chat_messages': schema.chatMessages,
      'reports': schema.reports,
      'report_bookmarks': schema.reportBookmarks,
      'x_credentials': schema.xCredentials,
      'x_folders': schema.xFolders
    };

    // Migrate each table in the correct order
    for (const tableName of TABLES_IN_ORDER) {
      const tableSchema = tableMap[tableName];
      if (!tableSchema) {
        console.warn(`Table schema not found for table: ${tableName}. Skipping.`);
        continue;
      }

      console.log(`Migrating table: ${tableName}`);

      // Fetch all data from source table
      const data = await sourceDb.select().from(tableSchema);
      console.log(`Found ${data.length} rows in ${tableName}`);

      if (data.length === 0) {
        console.log(`No data to migrate for table: ${tableName}. Skipping.`);
        continue;
      }

      // Insert data into target table
      // Process in batches to avoid potential memory issues
      const batchSize = 100;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        await targetDb.insert(tableSchema).values(batch);
        console.log(`Migrated batch ${i / batchSize + 1} of ${Math.ceil(data.length / batchSize)} for ${tableName}`);
      }

      console.log(`Successfully migrated table: ${tableName}`);
    }

    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    // Close the database connections
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run the migration function
migrateData()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });