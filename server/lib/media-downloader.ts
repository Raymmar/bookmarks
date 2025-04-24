/**
 * Media Downloader Service
 * 
 * This service is responsible for downloading and storing media files from external sources
 * such as X.com (Twitter). It ensures that media files are stored locally to avoid
 * authentication issues when retrieving media from external services.
 */

import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

// Media storage configuration
const MEDIA_DIR = path.join(process.cwd(), 'public', 'uploads', 'x-media');
const MEDIA_BASE_URL = '/uploads/x-media';

// Ensure media directory exists
fs.ensureDirSync(MEDIA_DIR);

/**
 * Interface for media file information
 */
interface MediaFile {
  originalUrl: string;
  localPath: string;
  publicUrl: string;
}

/**
 * Download a media file from a URL and store it locally
 * 
 * @param url The URL of the media file to download
 * @param accessToken Optional access token for authenticated requests
 * @returns Information about the downloaded file
 */
export async function downloadMedia(url: string, accessToken?: string): Promise<MediaFile | null> {
  try {
    // Skip if URL is empty or not a proper URL
    if (!url || !url.startsWith('http')) {
      console.warn(`Invalid media URL: ${url}`);
      return null;
    }

    // Generate a unique filename based on the URL
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    const fileExtension = getFileExtension(url);
    const filename = `${urlHash}${fileExtension}`;
    const localFilePath = path.join(MEDIA_DIR, filename);
    
    // Check if file already exists (to avoid re-downloading)
    if (fs.existsSync(localFilePath)) {
      console.log(`Media file already exists: ${localFilePath}`);
      return {
        originalUrl: url,
        localPath: localFilePath,
        publicUrl: `${MEDIA_BASE_URL}/${filename}`
      };
    }

    console.log(`Downloading media from ${url}`);
    
    // Set up fetch options for authenticated requests if needed
    const fetchOptions: any = {};
    if (accessToken) {
      fetchOptions.headers = {
        'Authorization': `Bearer ${accessToken}`
      };
    }
    
    // Fetch the media file
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
      console.error(`Failed to download media from ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    // Get the file as a buffer
    const buffer = await response.buffer();
    
    // Save the file
    await fs.writeFile(localFilePath, buffer);
    console.log(`Media file saved to ${localFilePath}`);
    
    return {
      originalUrl: url,
      localPath: localFilePath,
      publicUrl: `${MEDIA_BASE_URL}/${filename}`
    };
  } catch (error) {
    console.error(`Error downloading media from ${url}:`, error);
    return null;
  }
}

/**
 * Process multiple media URLs and download them
 * 
 * @param urls Array of media URLs to download
 * @param accessToken Optional access token for authenticated requests
 * @returns Array of local paths to the downloaded files
 */
export async function processMediaUrls(urls: string[], accessToken?: string): Promise<string[]> {
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return [];
  }
  
  const downloadPromises = urls.map(url => downloadMedia(url, accessToken));
  const results = await Promise.all(downloadPromises);
  
  // Filter out null results and extract public URLs
  return results
    .filter((result): result is MediaFile => result !== null)
    .map(result => result.publicUrl);
}

/**
 * Guess the file extension from a URL
 * 
 * @param url The URL to analyze
 * @returns The file extension, including the dot
 */
function getFileExtension(url: string): string {
  // Try to get file extension from URL
  const urlPath = new URL(url).pathname;
  const ext = path.extname(urlPath).toLowerCase();
  
  // If we found a valid extension, return it
  if (ext && ext.length > 1 && ext.length <= 5) {
    return ext;
  }
  
  // For URLs without clear extensions, guess based on common patterns
  if (url.includes('twimg.com')) {
    // Twitter images often use .jpg format
    return '.jpg';
  }
  
  // Default to .bin for unknown file types
  return '.bin';
}