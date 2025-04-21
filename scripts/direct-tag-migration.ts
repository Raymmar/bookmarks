/**
 * Direct Tag Migration Script using SQL for more reliable tag relationship creation
 */

import { db, pool } from "../server/db";
import { bookmarks, tags } from "../shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function migrateTagsDirectly() {
  console.log("Starting direct tag migration process...");
  
  try {
    // Get all bookmarks with their tags
    const allBookmarks = await db.select().from(bookmarks);
    console.log(`Found ${allBookmarks.length} bookmarks to process`);
    
    // Get all tags already in the database
    const allTags = await db.select().from(tags);
    console.log(`Found ${allTags.length} existing tags`);
    
    // Create a map of tag names to tag objects for quick lookup
    const tagMap = new Map();
    allTags.forEach(tag => {
      tagMap.set(tag.name, tag);
    });
    
    // For each bookmark, create bookmark_tags relationships directly with SQL
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
            // Use direct SQL to create the relationship
            // First check if the relationship already exists to avoid duplicates
            const existingCheck = await pool.query(`
              SELECT id FROM bookmark_tags 
              WHERE bookmark_id = $1 AND tag_id = $2
            `, [bookmark.id, tag.id]);
            
            let result = { rowCount: 0 };
            if (existingCheck.rowCount === 0) {
              // Create relationship only if it doesn't exist
              result = await pool.query(`
                INSERT INTO bookmark_tags (id, bookmark_id, tag_id)
                VALUES ($1, $2, $3)
                RETURNING id
              `, [crypto.randomUUID(), bookmark.id, tag.id]);
            }
            
            if (result.rowCount > 0) {
              // Increment tag count on success
              await pool.query(`
                UPDATE tags 
                SET count = count + 1 
                WHERE id = $1
              `, [tag.id]);
              
              totalRelations++;
            }
          } catch (error) {
            console.error(`Error creating relation for bookmark ${bookmark.id} and tag ${tag.id}:`, error);
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
migrateTagsDirectly().catch(console.error);