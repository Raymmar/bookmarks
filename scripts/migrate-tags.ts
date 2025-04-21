/**
 * Tag Migration Script
 * 
 * This script migrates tags from bookmarks.user_tags and bookmarks.system_tags arrays
 * to the normalized tags and bookmark_tags tables.
 */

import { db, pool } from "../server/db";
import { bookmarks, tags, bookmarkTags } from "../shared/schema";
import { eq } from "drizzle-orm";

async function migrateTagsToNormalizedSystem() {
  console.log("Starting tag migration process...");
  
  try {
    // 1. Get all bookmarks with their tags
    const allBookmarks = await db.select().from(bookmarks);
    console.log(`Found ${allBookmarks.length} bookmarks to process`);
    
    // 2. Extract all unique tags
    const uniqueUserTags = new Set<string>();
    const uniqueSystemTags = new Set<string>();
    
    allBookmarks.forEach(bookmark => {
      if (bookmark.user_tags && Array.isArray(bookmark.user_tags)) {
        bookmark.user_tags.forEach(tag => uniqueUserTags.add(tag));
      }
      
      if (bookmark.system_tags && Array.isArray(bookmark.system_tags)) {
        bookmark.system_tags.forEach(tag => uniqueSystemTags.add(tag));
      }
    });
    
    console.log(`Found ${uniqueUserTags.size} unique user tags and ${uniqueSystemTags.size} unique system tags`);
    
    // 3. Insert all unique tags into the tags table
    const userTagPromises = Array.from(uniqueUserTags).map(async tagName => {
      // Check if tag already exists
      const existingTag = await db.select().from(tags).where(eq(tags.name, tagName));
      
      if (existingTag.length === 0) {
        const [newTag] = await db.insert(tags).values({
          name: tagName,
          type: "user",
          count: 0 // Will be updated later
        }).returning();
        
        return newTag;
      }
      
      return existingTag[0];
    });
    
    const systemTagPromises = Array.from(uniqueSystemTags).map(async tagName => {
      // Check if tag already exists
      const existingTag = await db.select().from(tags).where(eq(tags.name, tagName));
      
      if (existingTag.length === 0) {
        const [newTag] = await db.insert(tags).values({
          name: tagName,
          type: "system",
          count: 0 // Will be updated later
        }).returning();
        
        return newTag;
      }
      
      return existingTag[0];
    });
    
    const userTags = await Promise.all(userTagPromises);
    const systemTags = await Promise.all(systemTagPromises);
    
    console.log(`Inserted ${userTags.length} user tags and ${systemTags.length} system tags`);
    
    // 4. Create a map for quick lookups
    const tagMap = new Map();
    [...userTags, ...systemTags].forEach(tag => {
      tagMap.set(tag.name, tag);
    });
    
    // 5. For each bookmark, create bookmark_tags relations
    let totalRelations = 0;
    
    for (const bookmark of allBookmarks) {
      const bookmarkTags = [
        ...(bookmark.user_tags || []),
        ...(bookmark.system_tags || [])
      ];
      
      for (const tagName of bookmarkTags) {
        const tag = tagMap.get(tagName);
        
        if (tag) {
          try {
            // Create relation
            await db.insert(bookmarkTags).values({
              bookmark_id: bookmark.id,
              tag_id: tag.id
            });
            
            // Update tag count
            await db.update(tags)
              .set({ count: tag.count + 1 })
              .where(eq(tags.id, tag.id));
            
            // Update the tag in our map
            tag.count += 1;
            tagMap.set(tagName, tag);
            
            totalRelations++;
          } catch (error) {
            // If duplicate, skip
            if (error.message && error.message.includes('unique constraint')) {
              console.log(`Skipping duplicate relation for bookmark ${bookmark.id} and tag ${tag.id}`);
            } else {
              console.error(`Error creating relation for bookmark ${bookmark.id} and tag ${tag.id}:`, error);
            }
          }
        }
      }
    }
    
    console.log(`Created ${totalRelations} bookmark-tag relations`);
    console.log("Tag migration completed successfully");
    
  } catch (error) {
    console.error("Error during tag migration:", error);
  } finally {
    await pool.end();
  }
}

// Run the migration
migrateTagsToNormalizedSystem().catch(console.error);