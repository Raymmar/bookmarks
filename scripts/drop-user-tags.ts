/**
 * Script to drop the deprecated user_tags array column from bookmarks table
 * Now that we've migrated to the normalized tag system, we no longer need this column
 */

import { pool } from '../server/db';

async function dropUserTagsColumn() {
  try {
    console.log('Dropping user_tags column from bookmarks table...');
    
    // Connect to the database
    const client = await pool.connect();
    
    try {
      // Execute ALTER TABLE to drop the column
      const result = await client.query(`
        ALTER TABLE bookmarks
        DROP COLUMN IF EXISTS user_tags;
      `);
      
      console.log('Successfully dropped user_tags column');
    } finally {
      // Release the client back to the pool
      client.release();
    }
    
    console.log('Operation completed successfully');
  } catch (error) {
    console.error('Error dropping user_tags column:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Execute the function
dropUserTagsColumn();