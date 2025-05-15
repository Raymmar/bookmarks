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
  
  // If the tag contains spaces, only take the first word (to ensure single-word tags)
  if (normalizedTag.includes(' ')) {
    normalizedTag = normalizedTag.split(' ')[0];
  }
  
  return normalizedTag;
}

/**
 * Removes exact duplicates from a list of tags
 * @param tags Array of raw tag strings
 * @returns Deduplicated array of tags
 */
export function deduplicateTags(tags: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  
  // Handle multi-word tags by splitting them into individual words
  const expandedTags: string[] = [];
  
  for (const tag of tags) {
    if (!tag || typeof tag !== 'string') continue;
    
    // If tag has spaces, split it into multiple single-word tags
    if (tag.includes(' ')) {
      const words = tag.split(' ')
        .map(word => word.trim())
        .filter(word => word.length > 0);
      
      expandedTags.push(...words);
    } else {
      expandedTags.push(tag);
    }
  }
  
  // Normalize each tag (lowercase, special char removal, etc.)
  const normalizedTags = expandedTags.map(tag => normalizeTag(tag)).filter(Boolean);
  
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
  
  // Process multi-word tags by splitting them and normalize all tags
  // This ensures we get single-word, lowercase tags with special chars removed
  let result = deduplicateTags(filteredTags);
  
  // Limit to max number of tags if needed
  if (result.length > MAX_TAGS_PER_BOOKMARK) {
    result = result.slice(0, MAX_TAGS_PER_BOOKMARK);
  }
  
  console.log("After single-word formatting:", result);
  
  return result;
}

