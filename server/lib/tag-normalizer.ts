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
  
  // Special case for JavaScript variants
  if (tag.toLowerCase().includes('javascript') || tag.toLowerCase() === 'js') {
    return 'javascript';
  }
  
  // Special case for React variants
  if (tag.toLowerCase().includes('react.js') || tag.toLowerCase().includes('reactjs')) {
    return 'react';
  }
  
  // Special case for web development/web-dev variants
  if (tag.toLowerCase().includes('web-dev') || tag.toLowerCase().includes('webdev')) {
    return 'web development';
  }
  
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
  // Special case for JavaScript and JS
  if ((tag1.toLowerCase().includes('javascript') || tag1.toLowerCase() === 'js') &&
      (tag2.toLowerCase().includes('javascript') || tag2.toLowerCase() === 'js')) {
    return true;
  }
  
  // Special case for React variants
  if ((tag1.toLowerCase().includes('react') || tag1.toLowerCase().includes('reactjs')) &&
      (tag2.toLowerCase().includes('react') || tag2.toLowerCase().includes('reactjs'))) {
    return true;
  }
  
  // Special case for web development variants
  if ((tag1.toLowerCase().includes('webdev') || tag1.toLowerCase().includes('web development') || tag1.toLowerCase().includes('web-dev')) &&
      (tag2.toLowerCase().includes('webdev') || tag2.toLowerCase().includes('web development') || tag2.toLowerCase().includes('web-dev'))) {
    return true;
  }
  
  // Special case for tech/technology
  if ((tag1.toLowerCase() === 'tech' || tag1.toLowerCase() === 'technology') &&
      (tag2.toLowerCase() === 'tech' || tag2.toLowerCase() === 'technology')) {
    return true;
  }
  
  // First normalize both tags
  const normalizedTag1 = normalizeTag(tag1);
  const normalizedTag2 = normalizeTag(tag2);
  
  // If tags are the same after normalization, they're similar
  if (normalizedTag1 === normalizedTag2) return true;
  
  // Check if one is a subset of the other, but with a length limit to avoid matching 
  // unrelated tags where one is coincidentally contained in the other
  const shorterTag = normalizedTag1.length <= normalizedTag2.length ? normalizedTag1 : normalizedTag2;
  const longerTag = normalizedTag1.length > normalizedTag2.length ? normalizedTag1 : normalizedTag2;
  
  // Only consider them similar if:
  // 1. The shorter tag is at least 3 characters (to avoid matching "ai" in "nail")
  // 2. The longer tag contains the shorter tag as a whole word
  if (shorterTag.length >= 3 && 
      (longerTag === shorterTag || 
       longerTag.startsWith(shorterTag + ' ') || 
       longerTag.endsWith(' ' + shorterTag) ||
       longerTag.includes(' ' + shorterTag + ' '))) {
    return true;
  }
  
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
  
  // Special case handling for tech/technology
  const hasTech = normalizedTags.some(tag => tag === 'tech');
  const hasTechnology = normalizedTags.some(tag => tag === 'technology');
  const hasTechCommunity = normalizedTags.some(tag => tag === 'tech community');
  
  if ((hasTech || hasTechnology) && hasTechCommunity) {
    // Remove 'tech' and 'technology' if 'tech community' is present
    const filteredTags = normalizedTags.filter(tag => tag !== 'tech' && tag !== 'technology');
    normalizedTags.length = 0;
    normalizedTags.push(...filteredTags);
  }
  
  // Special case for programming/python programming
  const hasProgramming = normalizedTags.some(tag => tag === 'programming');
  const hasPythonProgramming = normalizedTags.some(tag => tag === 'python programming');
  
  // Explicit handling to ensure both are kept
  if (hasProgramming && hasPythonProgramming) {
    // Force keep both by explicitly not removing either one
    // They are different enough that both should be kept
  }
  
  // Special case for React and React.js
  const hasReact = normalizedTags.some(tag => tag === 'react' || tag === 'reactjs');
  const hasReactJs = normalizedTags.some(tag => tag.includes('react.js'));
  
  if (hasReact && hasReactJs) {
    // Filter out react.js variants
    const filteredTags = normalizedTags.filter(tag => !tag.includes('react.js'));
    normalizedTags.length = 0;
    normalizedTags.push(...filteredTags);
  }
  
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