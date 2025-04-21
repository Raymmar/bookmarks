/**
 * Script to drop the system_tags column from bookmarks table
 * Now that we've migrated to the normalized tag system, we no longer need this column
 */

import { pool } from '../server/db';

async function dropSystemTagsColumn() {
  console.log('=== STARTING SYSTEM_TAGS COLUMN REMOVAL ===');
  
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Check if system_tags column exists
    const checkColumnResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'bookmarks' AND column_name = 'system_tags'
    `);
    
    if (checkColumnResult.rowCount === 0) {
      console.log('Column "system_tags" does not exist, nothing to drop');
      await client.query('COMMIT');
      return;
    }
    
    console.log('Column "system_tags" exists, dropping it from the bookmarks table');
    
    // Drop the system_tags column
    await client.query(`
      ALTER TABLE bookmarks
      DROP COLUMN system_tags
    `);
    
    console.log('Successfully dropped the system_tags column');
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('=== COLUMN REMOVAL COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    // Rollback the transaction on error
    await client.query('ROLLBACK');
    console.error('Error during column removal:', error);
    throw error;
  } finally {
    // Release the client
    client.release();
  }
}

// Run the script
dropSystemTagsColumn()
  .then(() => {
    console.log('Column removal completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during column removal:', error);
    process.exit(1);
  });