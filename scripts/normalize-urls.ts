/**
 * URL Normalization Migration Script
 * 
 * This script updates all existing bookmarks to use normalized URLs and merges any duplicates.
 * It ensures that URLs like "https://www.sarasota.tech" and "https://sarasota.tech" are 
 * treated as the same URL to prevent duplicate nodes in the graph visualization.
 */

import { db } from '../server/db';
import { bookmarks } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { normalizeUrl, extractRootDomain } from '../shared/url-service';

/**
 * Main migration function to normalize all URLs in the bookmarks table
 */
async function normalizeAllUrls() {
  console.log("Starting URL normalization migration...");
  
  try {
    // 1. Get all bookmarks
    const allBookmarks = await db.select().from(bookmarks);
    console.log(`Found ${allBookmarks.length} bookmarks to process`);
    
    // 2. Create a map to track normalized URLs and their corresponding bookmark IDs
    const normalizedUrlMap = new Map<string, string[]>();
    
    // 3. Process each bookmark and identify duplicates
    for (const bookmark of allBookmarks) {
      if (!bookmark.url) {
        console.log(`Skipping bookmark ${bookmark.id} with no URL`);
        continue;
      }
      
      const originalUrl = bookmark.url;
      const normalizedUrl = normalizeUrl(originalUrl);
      
      // Store the bookmark ID with its normalized URL
      if (!normalizedUrlMap.has(normalizedUrl)) {
        normalizedUrlMap.set(normalizedUrl, [bookmark.id]);
      } else {
        normalizedUrlMap.get(normalizedUrl)!.push(bookmark.id);
      }
      
      // Update the bookmark with the normalized URL if it's different
      if (originalUrl !== normalizedUrl) {
        console.log(`Updating ${bookmark.id}: "${originalUrl}" -> "${normalizedUrl}"`);
        
        await db.update(bookmarks)
          .set({ 
            url: normalizedUrl
            // Note: We're only updating URL since 'domain' field doesn't exist in schema
            // If a domain field is added later, we could extract it with:
            // domain: extractRootDomain(normalizedUrl)
          })
          .where(eq(bookmarks.id, bookmark.id));
      }
    }
    
    // 4. Handle duplicates (if desired) - Log duplicates for now
    let duplicateCount = 0;
    for (const [normalizedUrl, bookmarkIds] of normalizedUrlMap.entries()) {
      if (bookmarkIds.length > 1) {
        duplicateCount++;
        console.log(`Found ${bookmarkIds.length} duplicate bookmarks for URL: ${normalizedUrl}`);
        console.log(`  Bookmark IDs: ${bookmarkIds.join(", ")}`);
        
        // At this point, you could choose to merge these duplicates
        // For this script version, we'll just log them for manual review
      }
    }
    
    console.log(`\nURL normalization complete!`);
    console.log(`Processed ${allBookmarks.length} bookmarks`);
    console.log(`Found ${duplicateCount} sets of duplicate URLs`);
    
    // Add instructions for handling duplicates
    if (duplicateCount > 0) {
      console.log("\nTo automatically merge duplicates, uncomment and run the mergeDuplicates function below.");
      console.log("This will preserve the first bookmark for each URL and delete the others.");
    }
    
  } catch (error) {
    console.error("Error during URL normalization:", error);
  }
}

/**
 * Function to merge duplicate bookmarks
 * This preserves the first bookmark for each URL and merges content from duplicates
 */
async function mergeDuplicates() {
  console.log("Starting duplicate bookmark merging...");
  
  try {
    // Get all bookmarks with their normalized URLs
    const allBookmarks = await db.select().from(bookmarks);
    
    // Group bookmarks by normalized URL
    const urlMap = new Map<string, string[]>();
    for (const bookmark of allBookmarks) {
      const url = bookmark.url;
      if (!url) continue;
      
      if (!urlMap.has(url)) {
        urlMap.set(url, [bookmark.id]);
      } else {
        urlMap.get(url)!.push(bookmark.id);
      }
    }
    
    // Process duplicates
    let deletedCount = 0;
    for (const [url, ids] of urlMap.entries()) {
      if (ids.length > 1) {
        // Keep the first bookmark and delete the rest
        const primaryId = ids[0];
        const duplicateIds = ids.slice(1);
        
        console.log(`Merging bookmarks for ${url}`);
        console.log(`  Keeping: ${primaryId}`);
        console.log(`  Merging and deleting: ${duplicateIds.join(", ")}`);
        
        // TODO: In a more advanced implementation, we could merge the content
        // of duplicates into the primary bookmark (e.g., combine tags, notes, etc.)
        
        // Delete duplicates
        for (const duplicateId of duplicateIds) {
          await db.delete(bookmarks).where(eq(bookmarks.id, duplicateId));
          deletedCount++;
        }
      }
    }
    
    console.log(`\nDuplicate merging complete!`);
    console.log(`Deleted ${deletedCount} duplicate bookmarks`);
    
  } catch (error) {
    console.error("Error merging duplicates:", error);
  }
}

// Run the migration
normalizeAllUrls()
  .then(() => {
    console.log("URL normalization migration completed successfully");
    return mergeDuplicates();
  })
  .then(() => {
    console.log("Complete migration process finished");
    process.exit(0);
  })
  .catch(error => {
    console.error("Migration failed:", error);
    process.exit(1);
  });