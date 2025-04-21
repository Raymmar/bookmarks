/**
 * Normalize Existing Tags Script
 * 
 * This script applies our tag normalization system to all existing tags in the database.
 * It identifies duplicate and similar tags, normalizes them, and updates all bookmark-tag
 * associations to use the normalized versions.
 */

import { db } from '../server/db';
import { tags, bookmarkTags } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { processAITags } from '../server/lib/tag-normalizer';

interface TagWithCount {
  id: string;
  name: string;
  type: string;
  count: number;
}

/**
 * Main function to normalize all existing tags
 */
async function normalizeExistingTags() {
  console.log('=== STARTING TAG NORMALIZATION PROCESS ===');
  
  // Step 1: Get all tags
  console.log('\n1. Fetching all tags from database...');
  const allTags = await db.select().from(tags);
  console.log(`Found ${allTags.length} tags in the system`);
  
  // Step 2: Group tags by normalized name
  console.log('\n2. Normalizing tags and identifying duplicates...');
  const tagMap = new Map<string, TagWithCount[]>();
  
  // Create a collection of all tag names for normalization
  const allTagNames = allTags.map(tag => tag.name);
  
  // Use our tag normalizer to process all tags
  const normalizedNames = processAITags(allTagNames);
  
  console.log('Original tags:', allTagNames);
  console.log('Normalized tags:', normalizedNames);
  
  // Build mapping between original and normalized tags
  const normalizationMap = new Map<string, string>();
  allTagNames.forEach((original, i) => {
    // Make sure we don't introduce conflicts like "code" -> "code hosting" if "code hosting" is already a tag
    const normalizedName = normalizedNames[i] || original;
    normalizationMap.set(original, normalizedName);
  });
  
  // Log normalization map for debugging
  console.log('Normalization map:');
  Array.from(normalizationMap.entries()).forEach(([original, normalized]) => {
    if (original !== normalized) {
      console.log(`  "${original}" -> "${normalized}"`);
    }
  });
  
  // Group tags by their normalized names to find duplicates
  allTags.forEach(tag => {
    const normalizedName = normalizationMap.get(tag.name) || tag.name;
    
    if (!tagMap.has(normalizedName)) {
      tagMap.set(normalizedName, []);
    }
    
    tagMap.get(normalizedName)!.push({
      id: tag.id,
      name: tag.name,
      type: tag.type,
      count: tag.count || 0
    });
  });
  
  // Step 3: Process duplicate groups
  console.log('\n3. Processing tag groups and handling duplicates...');
  
  // Map to store the primary tag ID for each normalized name
  const primaryTagMap = new Map<string, string>();
  // Map to track which tags should be merged into which primary tags
  const tagMergeMap = new Map<string, string>();
  
  for (const [normalizedName, tagGroup] of tagMap.entries()) {
    if (tagGroup.length === 1) {
      // If there's only one tag in this group, just update its name if needed
      const tag = tagGroup[0];
      if (tag.name !== normalizedName) {
        console.log(`Renaming single tag "${tag.name}" to "${normalizedName}"`);
        await db.update(tags)
          .set({ name: normalizedName })
          .where(eq(tags.id, tag.id));
      }
      primaryTagMap.set(normalizedName, tag.id);
      continue;
    }
    
    // For multiple tags with the same normalized name, we need to choose a primary
    console.log(`\nFound ${tagGroup.length} tags that normalize to "${normalizedName}":`);
    tagGroup.forEach(tag => console.log(`  - ${tag.name} (${tag.type}, count: ${tag.count})`));
    
    // Find the best candidate to be the primary tag
    // Preference: user tags > system tags, higher count > lower count
    tagGroup.sort((a, b) => {
      // First prefer user tags over system tags
      if (a.type !== b.type) {
        return a.type === 'user' ? -1 : 1;
      }
      // Then prefer higher count
      return b.count - a.count;
    });
    
    const primaryTag = tagGroup[0];
    console.log(`Selecting "${primaryTag.name}" as primary for "${normalizedName}"`);
    
    // Update primary tag name to normalized version
    if (primaryTag.name !== normalizedName) {
      console.log(`Renaming primary tag from "${primaryTag.name}" to "${normalizedName}"`);
      await db.update(tags)
        .set({ name: normalizedName })
        .where(eq(tags.id, primaryTag.id));
    }
    
    primaryTagMap.set(normalizedName, primaryTag.id);
    
    // Mark others for merge
    for (let i = 1; i < tagGroup.length; i++) {
      const duplicateTag = tagGroup[i];
      console.log(`  - Marking "${duplicateTag.name}" for merge into primary tag`);
      tagMergeMap.set(duplicateTag.id, primaryTag.id);
    }
  }
  
  // Step 4: Update bookmark-tag associations
  console.log('\n4. Updating bookmark-tag associations...');
  
  // Get all bookmark-tag associations
  const allBookmarkTags = await db.select().from(bookmarkTags);
  console.log(`Found ${allBookmarkTags.length} bookmark-tag associations`);
  
  let migratedAssociations = 0;
  let deletedDuplicates = 0;
  let duplicateAssociations = new Set<string>();
  
  // Track processed bookmark-tag pairs to avoid duplicates
  const processedPairs = new Set<string>();
  
  for (const bt of allBookmarkTags) {
    const tagId = bt.tag_id;
    const bookmarkId = bt.bookmark_id;
    const pairKey = `${bookmarkId}:${tagId}`;
    
    // Skip if we've already processed this pair
    if (processedPairs.has(pairKey)) {
      continue;
    }
    processedPairs.add(pairKey);
    
    // If this tag should be merged into another tag
    if (tagMergeMap.has(tagId)) {
      const primaryTagId = tagMergeMap.get(tagId)!;
      const newPairKey = `${bookmarkId}:${primaryTagId}`;
      
      // Check if the bookmark is already associated with the primary tag
      if (processedPairs.has(newPairKey)) {
        // This would create a duplicate, so just delete the association
        console.log(`Removing duplicate association between bookmark ${bookmarkId} and tag ${tagId}`);
        await db.delete(bookmarkTags)
          .where(
            eq(bookmarkTags.bookmark_id, bookmarkId) &&
            eq(bookmarkTags.tag_id, tagId)
          );
        deletedDuplicates++;
        duplicateAssociations.add(pairKey);
      } else {
        // Update the association to use the primary tag
        console.log(`Updating association from tag ${tagId} to primary tag ${primaryTagId} for bookmark ${bookmarkId}`);
        await db.update(bookmarkTags)
          .set({ tag_id: primaryTagId })
          .where(
            eq(bookmarkTags.bookmark_id, bookmarkId) &&
            eq(bookmarkTags.tag_id, tagId)
          );
        migratedAssociations++;
        processedPairs.add(newPairKey);
      }
    }
  }
  
  // Step 5: Update tag counts
  console.log('\n5. Updating tag counts...');
  
  // Recalculate counts for all tags
  for (const tagId of primaryTagMap.values()) {
    const count = await db.select({ count: bookmarkTags.bookmark_id })
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tag_id, tagId))
      .then(result => result.length);
    
    await db.update(tags)
      .set({ count })
      .where(eq(tags.id, tagId));
    
    console.log(`Updated count for tag ${tagId} to ${count}`);
  }
  
  // Step 6: Delete merged tags
  console.log('\n6. Deleting merged tags...');
  
  let deletedTags = 0;
  for (const [tagId, primaryTagId] of tagMergeMap.entries()) {
    // Check if there are any remaining associations
    const remainingAssociations = await db.select()
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tag_id, tagId));
    
    if (remainingAssociations.length === 0) {
      console.log(`Deleting merged tag ${tagId} (merged into ${primaryTagId})`);
      await db.delete(tags).where(eq(tags.id, tagId));
      deletedTags++;
    } else {
      console.log(`Warning: Tag ${tagId} still has ${remainingAssociations.length} associations, not deleting`);
    }
  }
  
  // Summary
  console.log('\n=== TAG NORMALIZATION COMPLETE ===');
  console.log(`Starting tags: ${allTags.length}`);
  console.log(`Normalized tag groups: ${tagMap.size}`);
  console.log(`Tags selected as primary: ${primaryTagMap.size}`);
  console.log(`Tags marked for merge: ${tagMergeMap.size}`);
  console.log(`Updated bookmark-tag associations: ${migratedAssociations}`);
  console.log(`Deleted duplicate associations: ${deletedDuplicates}`);
  console.log(`Deleted merged tags: ${deletedTags}`);
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