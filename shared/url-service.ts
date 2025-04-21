/**
 * URL Service 
 * 
 * A collection of utility functions for handling URLs in the application
 * to ensure consistent URL normalization and domain extraction.
 */

/**
 * Normalizes a URL to a standard format to prevent duplicate entries
 * 
 * Normalization includes:
 * - Converting to lowercase
 * - Removing "www." from the hostname
 * - Ensuring proper protocol (https:// or http://)
 * - Removing trailing slashes
 * - Removing certain query parameters (optional)
 * 
 * @param url The URL to normalize
 * @param removeParams Whether to remove tracking and session parameters
 * @returns The normalized URL string
 */
export function normalizeUrl(url: string, removeParams: boolean = false): string {
  if (!url) return url;
  
  try {
    // Add protocol if missing
    if (!url.includes('://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    
    // Convert to lowercase
    urlObj.hostname = urlObj.hostname.toLowerCase();
    
    // Remove www. from hostname
    if (urlObj.hostname.startsWith('www.')) {
      urlObj.hostname = urlObj.hostname.substring(4);
    }
    
    // Remove tracking parameters (optional)
    if (removeParams) {
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'ocid', 'msclkid', '_ga', 'mc_eid', 'mc_cid',
        'ref', 'source', 'ref_src', '_hsenc', '_hsmi', 'mkt_tok',
        'ref_url', 'curator_clanid', 'curator', '_gl', 'ref_url'
      ];
      
      const params = new URLSearchParams(urlObj.search);
      let paramsRemoved = false;
      
      paramsToRemove.forEach(param => {
        if (params.has(param)) {
          params.delete(param);
          paramsRemoved = true;
        }
      });
      
      if (paramsRemoved) {
        const paramString = params.toString();
        urlObj.search = paramString ? `?${paramString}` : '';
      }
    }
    
    // Remove trailing slash from pathname if it's just "/"
    let normalizedUrl = urlObj.toString();
    if (normalizedUrl.endsWith('/') && urlObj.pathname === '/') {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }
    
    return normalizedUrl;
    
  } catch (error) {
    // If URL is invalid or normalization fails, return the original URL
    console.error(`Failed to normalize URL: ${url}`, error);
    return url;
  }
}

/**
 * Extracts the root domain from a URL
 * e.g., https://blog.example.com/path -> example.com
 * 
 * @param url The URL to extract the domain from
 * @returns The root domain (without subdomain)
 */
export function extractRootDomain(url: string): string {
  if (!url) return '';
  
  try {
    // Add protocol if missing
    if (!url.includes('://')) {
      url = 'https://' + url;
    }
    
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Split hostname by dots
    const parts = hostname.split('.');
    
    // Handle special TLDs with multiple parts (e.g., co.uk, com.au)
    const specialTlds = ['co.uk', 'com.au', 'net.au', 'org.au', 'gov.au', 'ac.uk', 'edu.au'];
    
    if (parts.length > 2) {
      const lastTwoParts = parts.slice(-2).join('.');
      
      if (specialTlds.includes(lastTwoParts) && parts.length > 3) {
        // For special TLDs, we need domain + special TLD
        return parts.slice(-3).join('.');
      } else {
        // Regular case, get last two parts
        return parts.slice(-2).join('.');
      }
    }
    
    // If there are only two parts or fewer, return the whole hostname
    return hostname;
    
  } catch (error) {
    console.error(`Failed to extract domain from URL: ${url}`, error);
    return '';
  }
}

/**
 * Checks if two URLs should be considered equivalent after normalization
 * 
 * @param url1 The first URL to compare
 * @param url2 The second URL to compare
 * @param strictMode If true, compares exact URLs; if false, compares normalized URLs
 * @returns Whether the URLs are equivalent
 */
export function areUrlsEquivalent(url1: string, url2: string, strictMode: boolean = false): boolean {
  if (!url1 || !url2) return false;
  
  if (strictMode) {
    return url1 === url2;
  }
  
  return normalizeUrl(url1) === normalizeUrl(url2);
}