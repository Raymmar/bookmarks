import axios from 'axios';
import sharp from 'sharp';
import { createReadStream } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Ensure the temp directory exists
const TEMP_DIR = path.join(process.cwd(), 'temp_images');
if (!existsSync(TEMP_DIR)) {
  try {
    mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`Created temporary image directory at ${TEMP_DIR}`);
  } catch (err) {
    console.error('Failed to create temp image directory:', err);
  }
}

/**
 * Extract X.com image URLs from tweet URLs
 * This extracts only photo URLs, not video thumbnails
 */
export async function extractXImageUrls(tweetUrl: string, xAccessToken?: string): Promise<string[]> {
  try {
    if (!tweetUrl || !tweetUrl.includes('twitter.com') && !tweetUrl.includes('x.com')) {
      return [];
    }
    
    // Extract tweet ID from URL
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch || !tweetIdMatch[1]) {
      console.log(`Could not extract tweet ID from URL: ${tweetUrl}`);
      return [];
    }
    
    const tweetId = tweetIdMatch[1];
    console.log(`Extracted tweet ID: ${tweetId} from URL: ${tweetUrl}`);
    
    // If we have an access token, use it to get higher quality images
    if (xAccessToken) {
      try {
        // Use the Twitter API to get tweet details including media
        const response = await axios.get(
          `https://api.twitter.com/2/tweets/${tweetId}?expansions=attachments.media_keys&media.fields=url,preview_image_url,type`, 
          {
            headers: {
              'Authorization': `Bearer ${xAccessToken}`
            }
          }
        );
        
        // Extract media URLs from the response
        const mediaItems = response.data?.includes?.media || [];
        const photoUrls = mediaItems
          .filter((media: any) => media.type === 'photo')
          .map((media: any) => media.url);
          
        console.log(`Extracted ${photoUrls.length} image URLs from tweet ${tweetId} using X API`);
        return photoUrls;
      } catch (apiError) {
        console.error(`Error fetching tweet media from X API:`, apiError);
        // Fall back to the regular method if API access fails
      }
    }
    
    // If we don't have an access token or API call failed, use a simple pattern match approach
    // This is less reliable but works for basic cases
    const imageUrls = [];
    for (let i = 1; i <= 4; i++) {
      // X.com photo URLs follow a standard pattern
      imageUrls.push(`https://pbs.twimg.com/media/${tweetId}_${i}.jpg`);
    }
    
    console.log(`Generated ${imageUrls.length} potential image URLs for tweet ${tweetId} using pattern matching`);
    return imageUrls;
  } catch (error) {
    console.error('Error extracting X image URLs:', error);
    return [];
  }
}

/**
 * Download image from a URL and convert to Base64
 * Returns null if download fails
 */
export async function downloadAndConvertToBase64(imageUrl: string): Promise<string | null> {
  try {
    console.log(`Attempting to download image from: ${imageUrl}`);
    
    // Generate a hash of the URL to use as a unique filename
    const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const tempFilePath = path.join(TEMP_DIR, `${urlHash}.jpg`);
    
    // Download the image
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 5000, // 5 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Save the image to a temporary file
    await writeFile(tempFilePath, response.data);
    console.log(`Downloaded image to ${tempFilePath}`);
    
    // Process with sharp to ensure it's valid and optimize
    const processedImageBuffer = await sharp(tempFilePath)
      .resize({ width: 1024, height: 1024, fit: 'inside' }) // Resize if necessary
      .jpeg({ quality: 80 }) // Compress
      .toBuffer();
    
    // Convert to base64
    const base64Image = processedImageBuffer.toString('base64');
    console.log(`Successfully converted image to base64 (${base64Image.length} chars)`);
    
    return `data:image/jpeg;base64,${base64Image}`;
  } catch (error) {
    console.error(`Error downloading/processing image from ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Process multiple image URLs and return only valid base64 images
 */
export async function processImageUrls(imageUrls: string[]): Promise<string[]> {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }
  
  console.log(`Processing ${imageUrls.length} image URLs`);
  
  // Process each URL in parallel
  const base64Promises = imageUrls.map(url => downloadAndConvertToBase64(url));
  const base64Results = await Promise.all(base64Promises);
  
  // Filter out null results (failed downloads)
  const validBase64Images = base64Results.filter(result => result !== null) as string[];
  console.log(`Successfully processed ${validBase64Images.length} of ${imageUrls.length} images`);
  
  return validBase64Images;
}