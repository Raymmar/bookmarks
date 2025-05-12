/**
 * Migration Script for Adding Unique Constraint to Bookmarks
 * 
 * This script adds a unique constraint to the bookmarks table to prevent duplicate
 * external_id entries for the same user and source.
 */

import { db, pool } from "../server/db";
import { bookmarks } from "../shared/schema";
import { sql } from "drizzle-orm";

async function addUniqueConstraintToBookmarks() {
  console.log('Starting migration to add unique constraint to bookmarks table');

  try {
    // First, check for existing duplicates to clean up
    console.log('Checking for existing duplicate bookmarks...');
    
    const duplicatesQuery = `
      SELECT external_id, user_id, source, COUNT(*) as count, array_agg(id) as bookmark_ids
      FROM bookmarks
      WHERE external_id IS NOT NULL AND external_id != ''
      GROUP BY external_id, user_id, source
      HAVING COUNT(*) > 1
    `;
    
    const duplicates = await db.execute(sql.raw(duplicatesQuery));
    const duplicateRows = duplicates.rows as any[];
    
    console.log(`Found ${duplicateRows.length} groups of duplicate bookmarks`);
    
    // Handle duplicates before adding constraint
    if (duplicateRows.length > 0) {
      console.log('Cleaning up duplicate bookmarks...');
      
      for (const dupe of duplicateRows) {
        try {
          console.log(`Processing duplicate group for external_id: ${dupe.external_id}, user: ${dupe.user_id}`);
          
          // Get the IDs of all duplicates
          const ids = dupe.bookmark_ids.slice(1); // Keep the first one, remove others
          
          console.log(`Keeping bookmark ${dupe.bookmark_ids[0]}, removing ${ids.length} duplicates`);
          
          // Delete the duplicates (all except the first one)
          for (const id of ids) {
            await db.execute(sql.raw(`DELETE FROM bookmarks WHERE id = '${id}'`));
          }
          
          console.log(`Removed ${ids.length} duplicate bookmarks for external_id: ${dupe.external_id}`);
        } catch (error) {
          console.error(`Error processing duplicate group:`, error);
        }
      }
    }
    
    // Now add the unique constraint
    console.log('Adding unique constraint to bookmarks table...');
    
    const addConstraintQuery = `
      ALTER TABLE bookmarks
      ADD CONSTRAINT unique_user_external_id_source
      UNIQUE (user_id, external_id, source);
    `;
    
    await db.execute(sql.raw(addConstraintQuery));
    
    console.log('Successfully added unique constraint to bookmarks table');
    
    // Close pool to end process
    await pool.end();
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the migration
addUniqueConstraintToBookmarks();