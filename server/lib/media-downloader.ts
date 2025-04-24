/**
 * Media Downloader Service
 * 
 * This service is responsible for downloading and storing media files from external sources
 * such as X.com (Twitter). It ensures that media files are stored locally to avoid
 * authentication issues when retrieving media from external services.
 */

import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';

/**
 * Interface for media file information
 */
interface MediaFile {
  originalUrl: string;
  localPath: string;
  publicUrl: string;
}

/**
 * Ensure the upload directory exists
 */
async function ensureUploadDirectory() {
  const mediaDir = path.join(process.cwd(), 'public', 'uploads', 'x-media');
  await fs.ensureDir(mediaDir);
  return mediaDir;
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
    // Skip invalid URLs or URLs we don't want to download
    if (!url || url.trim() === '' || !url.startsWith('http')) {
      console.log(`Skipping invalid URL: ${url}`);
      return null;
    }
    
    // Generate a unique filename
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    const fileExtension = getFileExtension(url);
    const filename = `${urlHash}${fileExtension}`;
    
    // Ensure the directory exists
    const uploadDir = await ensureUploadDirectory();
    const filePath = path.join(uploadDir, filename);
    const publicPath = `/uploads/x-media/${filename}`;
    
    // Check if the file already exists
    if (await fs.pathExists(filePath)) {
      console.log(`Media file already exists for ${url}, skipping download`);
      return {
        originalUrl: url,
        localPath: filePath,
        publicUrl: publicPath
      };
    }
    
    console.log(`Downloading media from ${url}`);
    
    // Set up request headers
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    // Download the file
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.error(`Failed to download media: ${response.status} ${response.statusText}`);
      return null;
    }
    
    // Create a writable stream to save the file
    const buffer = await response.buffer();
    await fs.writeFile(filePath, buffer);
    
    console.log(`Successfully downloaded media to ${filePath}`);
    
    return {
      originalUrl: url,
      localPath: filePath,
      publicUrl: publicPath
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
  if (!urls || urls.length === 0) {
    return [];
  }
  
  console.log(`Processing ${urls.length} media URLs`);
  
  // Download all media files in parallel
  const downloadPromises = urls.map(url => downloadMedia(url, accessToken));
  const results = await Promise.all(downloadPromises);
  
  // Filter out nulls and get the public paths
  const localMediaPaths = results
    .filter((result): result is MediaFile => result !== null)
    .map(result => result.publicUrl);
  
  console.log(`Successfully downloaded ${localMediaPaths.length} out of ${urls.length} media files`);
  
  return localMediaPaths;
}

/**
 * Guess the file extension from a URL
 * 
 * @param url The URL to analyze
 * @returns The file extension, including the dot
 */
function getFileExtension(url: string): string {
  // Try to extract the extension from the URL
  const matches = url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)(\?.*)?$/i);
  if (matches && matches[1]) {
    return `.${matches[1].toLowerCase()}`;
  }
  
  // Check if the URL contains known image service patterns
  if (url.includes('pbs.twimg.com') || url.includes('twitter.com')) {
    return '.jpg'; // Twitter images are typically JPGs
  }
  
  // Default to .bin for unknown types
  return '.bin';
}