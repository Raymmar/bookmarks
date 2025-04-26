/**
 * Twitter to X URL Migration Script
 * 
 * This script finds all bookmarks with twitter.com URLs and updates them to use x.com instead.
 * It preserves the path portion of the URL, only changing the domain name.
 */

import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq, like, sql } from 'drizzle-orm';

/**
 * Main migration function to update Twitter URLs to X URLs
 */
async function updateTwitterToXUrls() {
  console.log('Starting Twitter to X URL migration');

  try {
    // Count how many bookmarks have twitter.com URLs
    const countResult = await db.select({ count: sql`count(*)` })
      .from(schema.bookmarks)
      .where(like(schema.bookmarks.url, 'https://twitter.com/%'));

    const count = Number(countResult[0].count);
    console.log(`Found ${count} bookmarks with twitter.com URLs`);

    if (count === 0) {
      console.log('No bookmarks need to be updated. Migration complete.');
      return;
    }

    // Get all bookmarks with twitter.com URLs
    const bookmarksToUpdate = await db.select({
      id: schema.bookmarks.id,
      url: schema.bookmarks.url
    })
    .from(schema.bookmarks)
    .where(like(schema.bookmarks.url, 'https://twitter.com/%'));

    console.log(`Retrieved ${bookmarksToUpdate.length} bookmarks to update`);

    // Process bookmarks in batches to avoid timeouts
    let updated = 0;
    let errors = 0;
    const batchSize = 20;
    
    // Create batches of bookmarks to process
    for (let i = 0; i < bookmarksToUpdate.length; i += batchSize) {
      const batch = bookmarksToUpdate.slice(i, i + batchSize);
      console.log(`Processing batch ${i/batchSize + 1} (${i} to ${Math.min(i + batchSize, bookmarksToUpdate.length)})`);
      
      // Process this batch
      for (const bookmark of batch) {
        try {
          // Replace twitter.com with x.com in the URL
          const newUrl = bookmark.url.replace('https://twitter.com/', 'https://x.com/');
          
          // Update the bookmark
          await db.update(schema.bookmarks)
            .set({ 
              url: newUrl,
              updated_at: new Date() 
            })
            .where(eq(schema.bookmarks.id, bookmark.id));
          
          updated++;
        } catch (error) {
          console.error(`Error updating bookmark ${bookmark.id}:`, error);
          errors++;
        }
      }
      
      // Log progress after each batch
      console.log(`Updated ${updated}/${bookmarksToUpdate.length} bookmarks`);
    }

    console.log('Migration complete');
    console.log(`Updated ${updated} bookmarks`);
    
    if (errors > 0) {
      console.log(`Encountered ${errors} errors during migration`);
    }
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

// Run the function
updateTwitterToXUrls()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { updateTwitterToXUrls };