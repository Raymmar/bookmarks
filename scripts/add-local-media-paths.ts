/**
 * Migration Script to add local_media_paths column to bookmarks table
 * 
 * This script adds the local_media_paths column to the bookmarks table
 * to store paths to downloaded media files
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function addLocalMediaPathsColumn() {
  try {
    console.log('Adding local_media_paths column to bookmarks table...');
    
    // Check if column already exists to avoid errors
    const columnExists = await db.execute(sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'bookmarks'
      AND column_name = 'local_media_paths'
    `);
    
    if (columnExists.rows.length > 0) {
      console.log('Column local_media_paths already exists');
      return;
    }
    
    // Add the column if it doesn't exist
    await db.execute(sql`
      ALTER TABLE bookmarks
      ADD COLUMN local_media_paths TEXT[] DEFAULT NULL
    `);
    
    console.log('Column local_media_paths successfully added to bookmarks table');
  } catch (error) {
    console.error('Failed to add local_media_paths column:', error);
    throw error;
  }
}

// Execute the migration
addLocalMediaPathsColumn()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });