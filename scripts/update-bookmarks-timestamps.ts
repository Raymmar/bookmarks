/**
 * Migration Script for updated_at field
 * 
 * This script updates all existing bookmarks to have a proper updated_at timestamp
 * For existing bookmarks, it sets updated_at equal to date_saved, so that
 * initial sorting by recency makes sense
 */
import { db } from "../server/db";
import { bookmarks } from "../shared/schema";
import { sql } from "drizzle-orm";

async function updateBookmarksTimestamps() {
  console.log("Starting migration: Adding updated_at timestamps to existing bookmarks");
  
  try {
    // For all bookmarks without an updated_at value or with a null value,
    // set updated_at to the same as date_saved
    const result = await db.execute(sql`
      UPDATE bookmarks 
      SET updated_at = date_saved 
      WHERE updated_at IS NULL
    `);
    
    console.log(`Migration completed successfully: ${result.rowCount} bookmarks updated`);
  } catch (error) {
    console.error("Error during migration:", error);
    throw error;
  }
}

// Run the migration
updateBookmarksTimestamps()
  .then(() => {
    console.log("Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });