/**
 * Tag Normalization Utility
 * 
 * Provides consistent tag formatting and deduplication to ensure 
 * better tag quality across the bookmark system.
 */

/**
 * Normalize a single tag string to follow consistent standards
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
  
  // Convert dashes and underscores to spaces for further processing
  normalizedTag = normalizedTag.replace(/[-_]/g, ' ');
  
  // Trim whitespace again
  normalizedTag = normalizedTag.trim();
  
  return normalizedTag;
}

/**
 * Functions to check if two tags are semantically similar
 * @param tag1 First tag to compare
 * @param tag2 Second tag to compare
 * @returns Boolean indicating if the tags are similar
 */
export function areSimilarTags(tag1: string, tag2: string): boolean {
  // First normalize both tags
  const normalizedTag1 = normalizeTag(tag1);
  const normalizedTag2 = normalizeTag(tag2);
  
  // If tags are the same after normalization, they're similar
  if (normalizedTag1 === normalizedTag2) return true;
  
  // Check if one tag is a subset of the other
  // e.g., "tech" and "tech community" - we'd prefer the more specific one
  if (normalizedTag1.includes(normalizedTag2) || normalizedTag2.includes(normalizedTag1)) {
    return true;
  }
  
  // Could add more sophisticated checks here like Levenshtein distance
  // for minor typos, but that might require a more complex algorithm
  
  return false;
}

/**
 * Removes duplicate and redundant tags from a list
 * @param tags Array of raw tag strings
 * @returns Deduplicated and normalized array of tags
 */
export function deduplicateTags(tags: string[]): string[] {
  if (!tags || !Array.isArray(tags)) return [];
  
  // First normalize all tags
  const normalizedTags = tags.map(tag => normalizeTag(tag)).filter(Boolean);
  
  // Remove exact duplicates using a Set
  const uniqueTags = [...new Set(normalizedTags)];
  
  // Handle semantic duplicates (more complex)
  const result: string[] = [];
  
  // Process uniqueTags to handle semantic duplicates
  uniqueTags.forEach(tag => {
    // Skip if already included
    if (result.some(existingTag => areSimilarTags(existingTag, tag))) {
      // If the current tag is more specific than existing tag, 
      // replace the existing one with this one
      const existingIndex = result.findIndex(existingTag => 
        areSimilarTags(existingTag, tag) && tag.length > existingTag.length
      );
      
      if (existingIndex >= 0) {
        result[existingIndex] = tag;
      }
      
      // Otherwise skip this tag as it's too similar to an existing one
    } else {
      result.push(tag);
    }
  });
  
  return result;
}

/**
 * Processes tags from AI to ensure quality and consistency
 * @param rawTags Raw tags array from AI or user input
 * @returns Array of high-quality normalized tags
 */
export function processAITags(rawTags: string[]): string[] {
  if (!rawTags || !Array.isArray(rawTags)) return [];
  
  console.log("Tag normalization started with raw tags:", rawTags);
  
  // Filter out obviously invalid tags
  const filteredTags = rawTags.filter(tag => {
    if (!tag || typeof tag !== 'string') return false;
    if (tag.trim().length < 2) return false; // Too short to be meaningful
    if (tag.trim().length > 50) return false; // Too long to be a reasonable tag
    
    return true;
  });
  
  console.log("After initial filtering:", filteredTags);
  
  // Normalize and deduplicate
  const result = deduplicateTags(filteredTags);
  
  console.log("After normalization and deduplication:", result);
  
  return result;
}

/**
 * Enhanced system prompt for AI tag generation to improve consistency
 */
export const TAG_SYSTEM_PROMPT = `You are an AI assistant that extracts relevant tags from content. 
Generate 3-7 tags that accurately represent the main topics and themes of the given content.

IMPORTANT RULES FOR TAG GENERATION:
1. Tags should be lowercase
2. Use single words or short 2-3 word phrases 
3. Avoid redundant tags (e.g. don't include both "javascript" and "js")
4. Don't use special characters or punctuation
5. Prefer established category names over unusual terms
6. If multiple similar concepts exist, choose the most common term

You must respond with a JSON object in the following format:
{
  "tags": ["tag1", "tag2", "tag3"]
}

The tags should capture the main topics in the content while following the rules above.`;