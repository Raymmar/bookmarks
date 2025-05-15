/**
 * Tag Normalization Utility
 * 
 * Provides basic formatting for tags - keeping them lowercase and converting to single words
 * without complex normalization that could change the AI's original intent.
 */

/**
 * Simple tag normalization - only converts to lowercase and removes special characters
 * @param tag Raw tag string from AI or user input
 * @returns Normalized tag string
 */
export function normalizeTag(tag: string): string {
  if (!tag || typeof tag !== 'string') return '';
  
  // Convert to lowercase
  let normalizedTag = tag.toLowerCase();
  
  // Remove special characters that shouldn't be in tags
  normalizedTag = normalizedTag.replace(/['"!@#$%^&*()+={}[\]|\\:;,.<>?]/g, '');
  
  // Replace multiple spaces with a single space
  normalizedTag = normalizedTag.replace(/\s+/g, ' ');
  
  // Trim whitespace
  normalizedTag = normalizedTag.trim();
  
  return normalizedTag;
}

/**
 * Removes exact duplicates from a list of tags
 * @param tags Array of raw tag strings
 * @returns Deduplicated array of tags
 */
export function deduplicateTags(tags: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  
  // First normalize all tags (just lowercase and special char removal)
  const normalizedTags = tags.map(tag => normalizeTag(tag)).filter(Boolean);
  
  // Remove exact duplicates using Array.filter for uniqueness
  const uniqueTags = normalizedTags.filter((tag, index, self) => 
    self.indexOf(tag) === index
  );
  
  return uniqueTags;
}

/**
 * Constants for tag validation
 */
export const MAX_TAGS_PER_BOOKMARK = 5;

/**
 * Process tags to ensure they follow basic formatting rules
 * @param rawTags Raw tags array from AI or user input
 * @returns Array of properly formatted tags
 */
export function processAITags(rawTags: string[]): string[] {
  if (!rawTags || !Array.isArray(rawTags)) return [];
  
  console.log("Basic tag formatting started with raw tags:", rawTags);
  
  // Filter out obviously invalid tags
  let filteredTags = rawTags.filter(tag => {
    if (!tag || typeof tag !== 'string') return false;
    if (tag.trim().length < 2) return false; // Too short to be meaningful
    if (tag.trim().length > 50) return false; // Too long to be a reasonable tag
    
    return true;
  });
  
  // Normalize and deduplicate 
  let result = deduplicateTags(filteredTags);
  
  // Limit to max number of tags if needed
  if (result.length > MAX_TAGS_PER_BOOKMARK) {
    result = result.slice(0, MAX_TAGS_PER_BOOKMARK);
  }
  
  console.log("After basic formatting:", result);
  
  return result;
}

