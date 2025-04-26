/**
 * Twitter to X URL Migration Script
 * 
 * This script finds all bookmarks with twitter.com URLs and updates them to use x.com instead.
 * It preserves the path portion of the URL, only changing the domain name.
 */

import { db } from '../server/db';
import * as schema from '../shared/schema';
import { eq, like } from 'drizzle-orm';

/**
 * Main migration function to update Twitter URLs to X URLs
 */
async function updateTwitterToXUrls() {
  console.log('Starting Twitter to X URL migration');

  try {
    // Count how many bookmarks have twitter.com URLs
    const countResult = await db.select({ count: db.fn.count() })
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

    // Process each bookmark
    let updated = 0;
    let errors = 0;

    for (const bookmark of bookmarksToUpdate) {
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
        
        // Log progress periodically
        if (updated % 20 === 0 || updated === bookmarksToUpdate.length) {
          console.log(`Updated ${updated}/${bookmarksToUpdate.length} bookmarks`);
        }
      } catch (error) {
        console.error(`Error updating bookmark ${bookmark.id}:`, error);
        errors++;
      }
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

// Only run the function if this script is executed directly
if (require.main === module) {
  updateTwitterToXUrls()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { updateTwitterToXUrls };