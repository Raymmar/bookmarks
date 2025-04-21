/**
 * Analyze Tag Conflicts
 * 
 * This script analyzes existing tags to identify normalization conflicts
 * without actually modifying the database.
 */

import { db } from '../server/db';
import { tags } from '../shared/schema';
import { processAITags } from '../server/lib/tag-normalizer';

async function analyzeTagConflicts() {
  console.log('=== ANALYZING TAG NORMALIZATION CONFLICTS ===');
  
  // Step 1: Get all tags
  console.log('\n1. Fetching all tags from database...');
  const allTags = await db.select().from(tags);
  console.log(`Found ${allTags.length} tags in the system`);
  
  // Get all tag names
  const allTagNames = allTags.map(tag => tag.name);
  console.log('\nAll tags in system:');
  console.log(allTagNames.join(', '));
  
  // Step 2: Run the tag normalizer to see what it would do
  console.log('\n2. Analyzing normalized tags...');
  const normalizedTags = processAITags(allTagNames);
  
  // Track which normalized names correspond to which original tags
  const normalizedGroups = new Map<string, string[]>();
  
  normalizedTags.forEach((normalizedName, index) => {
    const originalName = allTagNames[index];
    
    if (!normalizedGroups.has(normalizedName)) {
      normalizedGroups.set(normalizedName, []);
    }
    
    normalizedGroups.get(normalizedName)!.push(originalName);
  });
  
  // Report on groups with more than one original tag
  console.log('\nTags that would normalize to the same value:');
  
  const conflictGroups = Array.from(normalizedGroups.entries())
    .filter(([_, originals]) => originals.length > 1)
    .sort((a, b) => b[1].length - a[1].length);
  
  conflictGroups.forEach(([normalizedName, originals]) => {
    console.log(`\n"${normalizedName}" would be the result of normalizing ${originals.length} tags:`);
    originals.forEach(original => {
      const tag = allTags.find(t => t.name === original);
      console.log(`  - "${original}" (type: ${tag?.type}, count: ${tag?.count || 0})`);
    });
  });
  
  if (conflictGroups.length === 0) {
    console.log('No conflicts found. All tags normalize to unique values.');
  } else {
    console.log(`\nFound ${conflictGroups.length} conflict groups affecting ${conflictGroups.reduce((sum, [_, originals]) => sum + originals.length, 0)} tags.`);
  }
  
  // Show tag changes without conflicts
  console.log('\nTags that would be renamed without conflicts:');
  normalizedTags.forEach((normalizedName, index) => {
    const originalName = allTagNames[index];
    if (originalName !== normalizedName && normalizedGroups.get(normalizedName)!.length === 1) {
      const tag = allTags.find(t => t.name === originalName);
      console.log(`  - "${originalName}" -> "${normalizedName}" (type: ${tag?.type}, count: ${tag?.count || 0})`);
    }
  });
  
  console.log('\n=== ANALYSIS COMPLETE ===');
}

// Run the analysis
analyzeTagConflicts()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during analysis:', error);
    process.exit(1);
  });