/**
 * Normalize Existing Tags Script Using SQL
 * 
 * This script applies our tag normalization system to all existing tags in the database,
 * using direct SQL queries for better control over the migration.
 */

import { db, pool } from '../server/db';
import { tags } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { processAITags } from '../server/lib/tag-normalizer';

/**
 * Main function to normalize all existing tags
 */
async function normalizeExistingTags() {
  console.log('=== STARTING TAG NORMALIZATION PROCESS ===');
  
  // Step 1: Get all tags
  console.log('\n1. Fetching all tags from database...');
  const allTags = await db.select().from(tags);
  console.log(`Found ${allTags.length} tags in the system`);
  
  // Step 2: Build the normalization map
  console.log('\n2. Normalizing tags and identifying duplicates...');
  
  // Create a collection of all tag names for normalization
  const allTagNames = allTags.map(tag => tag.name);
  
  // Use our tag normalizer to process all tags
  console.log('Original tags (sample):', allTagNames.slice(0, 10).join(', ') + (allTagNames.length > 10 ? '...' : ''));
  
  // Step 2.1: Analyze existing tags to identify problematic transformations
  console.log('\n2.1 Analyzing existing tags for potential conflicts...');
  const potentialNormalizedNames = processAITags(allTagNames);
  
  // Detect which normalized names would cause conflicts
  const normalizedCounts = new Map<string, Array<{original: string, index: number}>>();
  potentialNormalizedNames.forEach((normalized, index) => {
    const original = allTagNames[index];
    if (!normalizedCounts.has(normalized)) {
      normalizedCounts.set(normalized, []);
    }
    normalizedCounts.get(normalized)!.push({original, index});
  });
  
  // Identify conflicts where different original tags would normalize to the same value
  const conflicts = Array.from(normalizedCounts.entries())
    .filter(([normalizedName, occurrences]) => occurrences.length > 1)
    .map(([normalizedName, occurrences]) => ({
      normalizedName,
      occurrences: occurrences.map(o => o.original)
    }));
  
  if (conflicts.length > 0) {
    console.log(`Found ${conflicts.length} conflicts where different tags normalize to the same value:`);
    conflicts.forEach(({normalizedName, occurrences}) => {
      console.log(`  - "${normalizedName}" from: ${occurrences.join('", "')}`);
    });
  } else {
    console.log('No normalization conflicts detected.');
  }
  
  // Apply normalization but handle conflicts by keeping original names
  const normalizedNames = potentialNormalizedNames.map((normalizedName, index) => {
    const original = allTagNames[index];
    const conflictCount = normalizedCounts.get(normalizedName)?.length || 0;
    
    // If this would create a conflict, keep the original name
    if (conflictCount > 1 && original !== normalizedName) {
      console.log(`Keeping original "${original}" to avoid conflict with "${normalizedName}"`);
      return original;
    }
    return normalizedName;
  });
  
  console.log('Normalized tags (sample):', normalizedNames.slice(0, 10).join(', ') + (normalizedNames.length > 10 ? '...' : ''));
  
  // Build mapping between original and normalized tags
  const normalizationMap = new Map<string, string>();
  allTagNames.forEach((original, i) => {
    const normalizedName = normalizedNames[i] || original;
    normalizationMap.set(original, normalizedName);
  });
  
  // Log normalization changes for debugging
  console.log('\nTag normalizations (changed tags only):');
  const changes = Array.from(normalizationMap.entries())
    .filter(([original, normalized]) => original !== normalized);
  
  changes.forEach(([original, normalized]) => {
    console.log(`  "${original}" -> "${normalized}"`);
  });
  
  // Group tags by their normalized names
  const tagGroups = new Map<string, Array<typeof allTags[0]>>();
  
  allTags.forEach(tag => {
    const normalizedName = normalizationMap.get(tag.name) || tag.name;
    
    if (!tagGroups.has(normalizedName)) {
      tagGroups.set(normalizedName, []);
    }
    
    tagGroups.get(normalizedName)!.push(tag);
  });
  
  // Step 3: Process and normalize tags using SQL
  console.log('\n3. Processing tag groups and handling duplicates...');
  
  const client = await pool.connect();
  
  try {
    // Start a transaction
    await client.query('BEGIN');
    
    // Create temporary table to store tag mapping
    await client.query(`
      CREATE TEMP TABLE tag_mapping (
        original_id TEXT,
        target_id TEXT,
        original_name TEXT,
        normalized_name TEXT
      )
    `);
    
    // Process each tag group
    for (const [normalizedName, tagsInGroup] of tagGroups.entries()) {
      if (tagsInGroup.length === 1) {
        // Only one tag with this normalized name
        const tag = tagsInGroup[0];
        
        if (tag.name !== normalizedName) {
          // Update the tag name to the normalized version
          console.log(`Updating single tag: "${tag.name}" -> "${normalizedName}"`);
          await client.query(
            'UPDATE tags SET name = $1 WHERE id = $2',
            [normalizedName, tag.id]
          );
        }
        continue;
      }
      
      // Multiple tags with the same normalized name
      console.log(`\nFound ${tagsInGroup.length} tags that normalize to "${normalizedName}":`);
      tagsInGroup.forEach(tag => 
        console.log(`  - ${tag.name} (${tag.type}, count: ${tag.count || 0})`)
      );
      
      // Sort to find the best primary tag
      // Preference: user tags > system tags, higher count > lower count
      tagsInGroup.sort((a, b) => {
        // First prefer user tags over system tags
        if (a.type !== b.type) {
          return a.type === 'user' ? -1 : 1;
        }
        // Then prefer higher count
        return (b.count || 0) - (a.count || 0);
      });
      
      const primaryTag = tagsInGroup[0];
      console.log(`Selecting "${primaryTag.name}" as primary for "${normalizedName}"`);
      
      // Update primary tag name if needed
      if (primaryTag.name !== normalizedName) {
        console.log(`Updating primary tag name: "${primaryTag.name}" -> "${normalizedName}"`);
        await client.query(
          'UPDATE tags SET name = $1 WHERE id = $2',
          [normalizedName, primaryTag.id]
        );
      }
      
      // Mark other tags for merging
      for (let i = 1; i < tagsInGroup.length; i++) {
        const tagToMerge = tagsInGroup[i];
        console.log(`  Merging tag "${tagToMerge.name}" into primary tag`);
        
        // Insert mapping into temporary table
        await client.query(
          'INSERT INTO tag_mapping (original_id, target_id, original_name, normalized_name) VALUES ($1, $2, $3, $4)',
          [tagToMerge.id, primaryTag.id, tagToMerge.name, normalizedName]
        );
      }
    }
    
    // Step 4: Update bookmark-tag associations
    console.log('\n4. Updating bookmark-tag associations using SQL...');
    
    // Get count of associations to be updated
    const countResult = await client.query(`
      SELECT COUNT(*) FROM bookmark_tags bt
      JOIN tag_mapping tm ON bt.tag_id = tm.original_id
    `);
    
    const migrationsCount = parseInt(countResult.rows[0].count);
    console.log(`Found ${migrationsCount} bookmark-tag associations to update`);
    
    if (migrationsCount > 0) {
      // Delete duplicate associations that would be created by the merge
      const deleteDuplicatesResult = await client.query(`
        DELETE FROM bookmark_tags bt
        USING tag_mapping tm, bookmark_tags bt2
        WHERE bt.tag_id = tm.original_id
        AND bt2.bookmark_id = bt.bookmark_id
        AND bt2.tag_id = tm.target_id
        RETURNING bt.bookmark_id, bt.tag_id
      `);
      
      console.log(`Deleted ${deleteDuplicatesResult.rowCount} duplicate associations`);
      
      // Update the remaining associations
      const updateResult = await client.query(`
        UPDATE bookmark_tags bt
        SET tag_id = tm.target_id
        FROM tag_mapping tm
        WHERE bt.tag_id = tm.original_id
        RETURNING bt.bookmark_id, bt.tag_id, tm.target_id
      `);
      
      console.log(`Updated ${updateResult.rowCount} bookmark-tag associations`);
    }
    
    // Step 5: Update tag counts
    console.log('\n5. Updating tag counts...');
    
    // Update all tag counts
    await client.query(`
      UPDATE tags t
      SET count = (
        SELECT COUNT(*) FROM bookmark_tags bt
        WHERE bt.tag_id = t.id
      )
    `);
    
    console.log(`Updated counts for all tags`);
    
    // Step 6: Delete merged tags
    console.log('\n6. Deleting merged tags...');
    
    // Delete tags that have been merged
    const deleteResult = await client.query(`
      DELETE FROM tags t
      USING tag_mapping tm
      WHERE t.id = tm.original_id
      AND NOT EXISTS (
        SELECT 1 FROM bookmark_tags bt
        WHERE bt.tag_id = t.id
      )
      RETURNING t.id, t.name
    `);
    
    console.log(`Deleted ${deleteResult.rowCount} merged tags`);
    
    // Clean up temporary table
    await client.query('DROP TABLE tag_mapping');
    
    // Commit the transaction
    await client.query('COMMIT');
    
    console.log('\n=== TAG NORMALIZATION COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    // Rollback the transaction on error
    await client.query('ROLLBACK');
    console.error('Error during tag normalization:', error);
    throw error;
  } finally {
    // Release the client
    client.release();
  }
}

// Run the script
normalizeExistingTags()
  .then(() => {
    console.log('Tag normalization completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during tag normalization:', error);
    process.exit(1);
  });