/**
 * Tag Normalization Migration Script
 * 
 * This script properly normalizes all tags in the database by handling dependency chains
 * and using temporary names to avoid constraint violations.
 */

import { db, pool } from '../server/db';
import { tags } from '../shared/schema';
import { processAITags } from '../server/lib/tag-normalizer';

async function migrateTagNames() {
  console.log('=== STARTING TAG NORMALIZATION MIGRATION ===');
  
  // Step 1: Get all tags
  console.log('\n1. Fetching all tags from database...');
  const allTags = await db.select().from(tags);
  console.log(`Found ${allTags.length} tags in the system`);
  
  // Get all tag names
  const allTagNames = allTags.map(tag => tag.name);
  
  // Step 2: Generate normalized tags
  console.log('\n2. Generating normalized tag names...');
  const normalizedNames = processAITags(allTagNames);
  
  // Build normalization map
  const normalizationMap = new Map<string, string>();
  allTagNames.forEach((original, i) => {
    normalizationMap.set(original, normalizedNames[i]);
  });
  
  // Find tags that need to be renamed
  const tagsToRename = allTags.filter(tag => 
    normalizationMap.get(tag.name) !== tag.name
  );
  
  console.log(`Found ${tagsToRename.length} tags that need to be renamed`);
  
  // Step 3: Build dependency graph for renames
  console.log('\n3. Building tag rename dependency graph...');
  
  // Map of current name to desired name
  const renameMap = new Map<string, string>();
  
  // Map of desired name to original name(s)
  const inverseRenameMap = new Map<string, string[]>();
  
  tagsToRename.forEach(tag => {
    const normalizedName = normalizationMap.get(tag.name)!;
    renameMap.set(tag.name, normalizedName);
    
    if (!inverseRenameMap.has(normalizedName)) {
      inverseRenameMap.set(normalizedName, []);
    }
    inverseRenameMap.get(normalizedName)!.push(tag.name);
  });
  
  // Identify complex chains (where a name is both source and target)
  const complexChains = Array.from(renameMap.entries())
    .filter(([originalName, normalizedName]) => 
      inverseRenameMap.has(originalName)
    );
  
  if (complexChains.length > 0) {
    console.log(`Found ${complexChains.length} complex rename chains that need special handling:`);
    complexChains.forEach(([originalName, normalizedName]) => {
      console.log(`  - "${originalName}" -> "${normalizedName}" (but "${originalName}" is also a target)`);
    });
  }
  
  // Step 4: Create migration plan
  console.log('\n4. Creating migration plan with temporary names...');
  
  // Migration plan is a series of steps:
  // 1. Rename all sources to temporary names
  // 2. Rename all targets to their final names
  
  const temporaryPrefix = "tmp_migration_";
  
  // Map of tag ID to its temporary name
  const tempNames = new Map<string, string>();
  
  // Create temporary names for all tags being renamed
  tagsToRename.forEach(tag => {
    const tempName = `${temporaryPrefix}${tag.id}`;
    tempNames.set(tag.id, tempName);
  });
  
  // Step 5: Execute the migration
  console.log('\n5. Executing tag migration in a transaction...');
  
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    console.log('\n5a. First phase: Rename all tags to temporary names');
    
    for (const tag of tagsToRename) {
      const tempName = tempNames.get(tag.id)!;
      console.log(`  - Renaming "${tag.name}" -> "${tempName}" (temporary)`);
      
      await client.query(
        'UPDATE tags SET name = $1 WHERE id = $2',
        [tempName, tag.id]
      );
    }
    
    console.log('\n5b. Second phase: Rename to final normalized names');
    
    for (const tag of tagsToRename) {
      const finalName = normalizationMap.get(tag.name)!;
      const tempName = tempNames.get(tag.id)!;
      
      console.log(`  - Renaming "${tempName}" -> "${finalName}" (final)`);
      
      await client.query(
        'UPDATE tags SET name = $1 WHERE id = $2',
        [finalName, tag.id]
      );
    }
    
    // 5c. Update tag counts based on associations
    console.log('\n5c. Updating tag counts...');
    
    await client.query(`
      UPDATE tags t
      SET count = (
        SELECT COUNT(*) FROM bookmark_tags bt
        WHERE bt.tag_id = t.id
      )
    `);
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n=== TAG MIGRATION COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during tag migration:', error);
    throw error;
  } finally {
    client.release();
  }
  
  // Step 6: Verify results
  console.log('\n6. Verifying migration results...');
  
  const tagsAfter = await db.select().from(tags);
  
  // Check if any tags still have temporary names
  const tempTags = tagsAfter.filter(tag => tag.name.startsWith(temporaryPrefix));
  if (tempTags.length > 0) {
    console.warn(`Warning: Found ${tempTags.length} tags with temporary names that were not properly migrated`);
    tempTags.forEach(tag => console.warn(`  - ${tag.name} (ID: ${tag.id})`));
  } else {
    console.log('No temporary tag names found. Migration completed successfully.');
  }
  
  // Print summary of all tags
  console.log('\nCurrent tags in the system:');
  const tagsByName = tagsAfter.map(t => t.name).sort();
  console.log(tagsByName.join(', '));
}

// Run the migration
migrateTagNames()
  .then(() => {
    console.log('Tag migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });