/**
 * URL Service for standardizing and normalizing URLs
 * This ensures consistent handling of URLs throughout the application
 * to prevent duplication and improve relatedness between bookmarks.
 */

/**
 * Normalizes a URL by removing common variations that shouldn't count as different URLs
 * - Removes 'www.' prefix
 * - Standardizes protocol (http:// vs https://)
 * - Trims trailing slashes
 * - Handles case sensitivity (converts to lowercase)
 * 
 * @param url The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  try {
    // Handle cases where URL might not have protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Parse the URL into components
    const parsedUrl = new URL(url);
    
    // Remove www. from hostname
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    // Rebuild URL with normalized hostname
    const normalizedUrl = new URL(parsedUrl.toString());
    normalizedUrl.hostname = hostname;
    
    // Convert to string and remove trailing slash if present
    let result = normalizedUrl.toString();
    if (result.endsWith('/') && normalizedUrl.pathname === '/') {
      result = result.slice(0, -1);
    }
    
    return result.toLowerCase();
  } catch (error) {
    console.error('Error normalizing URL:', error);
    return url.toLowerCase(); // Return original URL in lowercase as fallback
  }
}

/**
 * Extracts the root domain from a URL
 * This is used for grouping related bookmarks by domain
 * 
 * @param url The URL to extract domain from
 * @returns The root domain
 */
export function extractRootDomain(url: string): string {
  if (!url) return '';
  
  try {
    // Normalize the URL first
    const normalizedUrl = normalizeUrl(url);
    
    // Parse the URL
    const parsedUrl = new URL(normalizedUrl);
    
    // Get hostname and split by dots
    const hostnameParts = parsedUrl.hostname.split('.');
    
    // Handle special cases like co.uk, com.au, etc.
    if (hostnameParts.length > 2) {
      const tld = hostnameParts[hostnameParts.length - 1];
      const sld = hostnameParts[hostnameParts.length - 2];
      
      // Check for country-specific TLDs that use a pattern like co.uk, com.au
      if ((sld === 'co' || sld === 'com' || sld === 'org' || sld === 'net' || sld === 'gov' || sld === 'edu') && 
          tld.length === 2) { // Country code is typically 2 chars
        // Return something like example.co.uk
        if (hostnameParts.length > 3) {
          return `${hostnameParts[hostnameParts.length - 3]}.${sld}.${tld}`;
        }
      }
    }
    
    // For regular domains like example.com, return the hostname
    // For subdomains like sub.example.com, return example.com
    if (hostnameParts.length > 1) {
      return `${hostnameParts[hostnameParts.length - 2]}.${hostnameParts[hostnameParts.length - 1]}`;
    }
    
    return parsedUrl.hostname;
  } catch (error) {
    console.error('Error extracting root domain:', error);
    return ''; // Return empty string on error
  }
}

/**
 * Compares two URLs to determine if they're effectively the same
 * Used to prevent duplicate bookmark entries
 * 
 * @param url1 First URL to compare
 * @param url2 Second URL to compare
 * @returns True if URLs should be considered the same
 */
export function areUrlsEquivalent(url1: string, url2: string): boolean {
  if (!url1 || !url2) return false;
  
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Checks if a URL already exists in a collection of bookmarks
 * 
 * @param url URL to check
 * @param bookmarks Array of bookmarks to check against
 * @returns The existing bookmark if found, undefined otherwise
 */
export function findExistingBookmarkByUrl(url: string, bookmarks: { url: string; id: string }[]): { url: string; id: string } | undefined {
  if (!url || !bookmarks || bookmarks.length === 0) return undefined;
  
  const normalizedUrl = normalizeUrl(url);
  return bookmarks.find(bookmark => normalizeUrl(bookmark.url) === normalizedUrl);
}

/**
 * Removes tracking parameters from URLs
 * This helps group related URLs and prevents duplicates from tracking variations
 * 
 * @param url URL to clean
 * @returns URL with tracking parameters removed
 */
export function removeTrackingParameters(url: string): string {
  if (!url) return '';
  
  try {
    const parsedUrl = new URL(url);
    
    // Common tracking parameters to remove
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
      'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'mc_cid', 'mc_eid',
      '_hsenc', '_hsmi', 'yclid', 'zanpid', 'dclid'
    ];
    
    // Create a new URLSearchParams object without the tracking parameters
    const searchParams = parsedUrl.searchParams;
    const cleanParams = new URLSearchParams();
    
    // Only keep non-tracking parameters
    for (const [key, value] of searchParams.entries()) {
      if (!trackingParams.includes(key.toLowerCase())) {
        cleanParams.append(key, value);
      }
    }
    
    // Rebuild the URL
    parsedUrl.search = cleanParams.toString();
    return parsedUrl.toString();
  } catch (error) {
    console.error('Error removing tracking parameters:', error);
    return url; // Return original URL as fallback
  }
}