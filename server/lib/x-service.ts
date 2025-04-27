/**
 * X.com API Service
 * 
 * Handles authentication and interaction with X.com (Twitter) API v2.
 * Responsible for:
 * - OAuth2 authentication flow with X.com
 * - Fetching user's bookmarked tweets
 * - Fetching user's folders
 * - Managing folder to collection mapping
 */

import { storage } from '../storage';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import type { Bookmark } from '@shared/schema';
import { 
  xCredentials, XCredentials, InsertXCredentials, 
  xFolders, XFolder, InsertXFolder, 
  bookmarks,
  InsertCollection, InsertBookmark
} from '@shared/schema';
import crypto from 'crypto';
import { URLSearchParams } from 'url';
import { Client, auth } from 'twitter-api-sdk';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

/**
 * X API configuration
 * These values should be obtained from the X Developer Portal
 */
const X_CLIENT_ID = process.env.X_CLIENT_ID || '';
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || '';
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || 'https://atmospr.replit.app/api/x/callback';
const X_API_BASE = 'https://api.twitter.com';

/**
 * Scopes needed for reading bookmarks
 */
const REQUIRED_SCOPES = [
  'tweet.read' as const,
  'users.read' as const,
  'bookmark.read' as const,
  'offline.access' as const
];

/**
 * Interface for X.com API responses
 */
interface XApiResponse<T> {
  data?: T;
  includes?: any;
  meta?: any;
  errors?: Array<{
    message: string;
    code: string;
  }>;
}

/**
 * Interface for X.com Tweet data
 * Structured to be compatible with the Twitter API SDK response
 */
interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count?: number;
  };
  entities?: {
    urls?: Array<any>; // Using any to accommodate the SDK's structure
    mentions?: Array<any>;
    hashtags?: Array<any>;
  };
  attachments?: {
    media_keys?: string[];
    poll_ids?: string[];
  };
  // Track local media files downloaded for this tweet
  local_media: {
    original_url: string;
    local_path: string;
    media_key: string;
    type: string;
  }[];
}

/**
 * Interface for X.com Media data
 * Represents media attachments to tweets (images, videos, etc.)
 */
interface XMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif' | 'video';
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
}

/**
 * Interface for X.com User data
 */
interface XUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}

/**
 * Interface for X.com Folder data
 */
interface XFolderData {
  id: string;
  name: string;
}

/**
 * X.com API service class
 */
export class XService {
  private authClient: auth.OAuth2User;
  private STATE = "state";
  
  constructor() {
    // Check API configuration
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      console.error('XService: Missing OAuth credentials - X_CLIENT_ID or X_CLIENT_SECRET not set');
    } else {
      console.log('XService: X OAuth client credentials are configured');
      console.log('XService: Redirect URI:', X_REDIRECT_URI);
    }
    
    // Initialize auth client with Twitter API SDK
    try {
      this.authClient = new auth.OAuth2User({
        client_id: X_CLIENT_ID,
        client_secret: X_CLIENT_SECRET,
        callback: X_REDIRECT_URI,
        scopes: REQUIRED_SCOPES,
      });
      console.log('XService: Auth client initialized successfully');
    } catch (error) {
      console.error('XService: Failed to initialize auth client:', error);
      // Initialize with empty values to prevent fatal errors
      this.authClient = new auth.OAuth2User({
        client_id: X_CLIENT_ID || 'missing',
        client_secret: X_CLIENT_SECRET || 'missing',
        callback: X_REDIRECT_URI,
        scopes: REQUIRED_SCOPES,
      });
    }
  }
  
  /**
   * Generate the OAuth authorization URL for X.com
   */
  getAuthorizationUrl(): string {
    console.log("XService: Generating authorization URL");

    if (!X_CLIENT_ID) {
      console.error("XService: X_CLIENT_ID environment variable is not set");
      throw new Error('X_CLIENT_ID environment variable is not set');
    }

    try {
      // Generate code verifier and challenge
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      
      console.log("XService: Generated code verifier length:", codeVerifier.length);
      console.log("XService: Generated code challenge length:", codeChallenge.length);
      
      // Create the authorization URL using the SDK
      // The Twitter API SDK interfaces are not fully documented with TypeScript interfaces
      // so we need to use the any type to add the code_challenge parameter
      const params: any = {
        state: this.STATE,
        code_challenge_method: "s256"
      };
      
      // Add code challenge if available
      if (codeChallenge) {
        params.code_challenge = codeChallenge;
      }
      
      const authUrl = this.authClient.generateAuthURL(params);
      
      console.log("XService: Generated authorization URL for X.com");
      
      return authUrl;
    } catch (error) {
      console.error("XService: Error generating authorization URL:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      throw error;
    }
  }

  /**
   * Exchange an authorization code for an access token
   */
  async exchangeCodeForToken(code: string, state: string): Promise<InsertXCredentials> {
    console.log("X.com exchangeCodeForToken: Starting token exchange process");
    
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      console.error("X.com exchangeCodeForToken: Missing OAuth client credentials in environment");
      throw new Error('X_CLIENT_ID or X_CLIENT_SECRET environment variables are not set');
    }

    console.log("X.com exchangeCodeForToken: Validating state parameter");
    console.log("State received:", state);
    console.log("Expected state:", this.STATE);
    
    if (state !== this.STATE) {
      console.error("X.com exchangeCodeForToken: State mismatch");
      throw new Error('State parameter does not match');
    }
    
    try {
      console.log("X.com exchangeCodeForToken: Requesting access token with code");
      
      // Exchange the code for an access token using the SDK
      const tokenResult = await this.authClient.requestAccessToken(code);
      
      console.log("X.com exchangeCodeForToken: Token obtained", {
        hasAccessToken: !!tokenResult.token.access_token,
        hasRefreshToken: !!tokenResult.token.refresh_token,
        expiresAt: tokenResult.token.expires_at
      });
      
      // Create a Twitter API client
      console.log("X.com exchangeCodeForToken: Creating Twitter API client");
      const client = new Client(this.authClient);
      
      // Get the authenticated user's information
      console.log("X.com exchangeCodeForToken: Fetching user information");
      const userResponse = await client.users.findMyUser();
      
      if (!userResponse.data) {
        console.error("X.com exchangeCodeForToken: No user data in response");
        throw new Error('Failed to get user info from X.com API');
      }
      
      console.log("X.com exchangeCodeForToken: User info obtained", {
        id: userResponse.data.id,
        username: userResponse.data.username
      });
      
      const userInfo = userResponse.data;
      
      // Calculate token expiration based on the token's expires_at
      let expiresAt: Date;
      if (tokenResult.token.expires_at) {
        expiresAt = new Date(tokenResult.token.expires_at);
        console.log("X.com exchangeCodeForToken: Token expires at", expiresAt);
      } else {
        // Default to 2 hours if no expiration is provided
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + 7200);
        console.log("X.com exchangeCodeForToken: No expiration provided, setting default to", expiresAt);
      }
      
      // Create credentials object
      const credentials: InsertXCredentials = {
        user_id: '', // This will be filled in by the calling function
        access_token: tokenResult.token.access_token || '',
        refresh_token: tokenResult.token.refresh_token || '',
        token_expires_at: expiresAt,
        x_user_id: userInfo.id,
        x_username: userInfo.username,
      };
      
      console.log("X.com exchangeCodeForToken: Credentials prepared successfully");
      return credentials;
    } catch (error) {
      console.error("X.com exchangeCodeForToken: Error during token exchange", error);
      if (error instanceof Error) {
        console.error("X.com exchangeCodeForToken error details:", error.message, error.stack);
      }
      throw error;
    }
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<Partial<XCredentials>> {
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      throw new Error('X_CLIENT_ID or X_CLIENT_SECRET environment variables are not set');
    }

    try {
      // Set up auth client with the refresh token
      this.authClient = new auth.OAuth2User({
        client_id: X_CLIENT_ID,
        client_secret: X_CLIENT_SECRET,
        callback: X_REDIRECT_URI,
        scopes: REQUIRED_SCOPES,
        token: {
          refresh_token: refreshToken,
          token_type: 'bearer'
        }
      });
      
      // Use the SDK to refresh the token
      const tokenResult = await this.authClient.refreshAccessToken();
      
      // Calculate token expiration
      let expiresAt: Date;
      if (tokenResult.token.expires_at) {
        expiresAt = new Date(tokenResult.token.expires_at);
      } else {
        // Default to 2 hours if no expiration is provided
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + 7200);
      }
      
      // Create updated credentials
      return {
        access_token: tokenResult.token.access_token || '',
        refresh_token: tokenResult.token.refresh_token || refreshToken,
        token_expires_at: expiresAt,
        updated_at: new Date(),
      };
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error(`Failed to refresh token: ${error}`);
    }
  }

  /**
   * Get the authenticated user's information
   */
  async getUserInfo(accessToken: string): Promise<XUser> {
    try {
      // Set up auth client with the access token
      this.authClient = new auth.OAuth2User({
        client_id: X_CLIENT_ID,
        client_secret: X_CLIENT_SECRET,
        callback: X_REDIRECT_URI,
        scopes: REQUIRED_SCOPES,
        token: {
          access_token: accessToken,
          token_type: 'bearer'
        }
      });
      
      // Create a Twitter API client
      const client = new Client(this.authClient);
      
      // Get user information using the SDK
      const userResponse = await client.users.findMyUser();
      
      if (!userResponse.data) {
        throw new Error('Failed to get user info from X.com API');
      }
      
      return {
        id: userResponse.data.id,
        name: userResponse.data.name,
        username: userResponse.data.username,
        profile_image_url: userResponse.data.profile_image_url
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error(`Failed to get user info: ${error}`);
    }
  }

  /**
   * Get user's bookmarked tweets
   * If folderId is provided, gets bookmarks from that specific folder
   */
  async getBookmarks(userId: string, paginationToken?: string, folderId?: string): Promise<{ 
    tweets: XTweet[], 
    users: { [key: string]: XUser }, 
    media: { [key: string]: XMedia },
    nextToken?: string 
  }> {
    // Get user credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    try {
      // Check if we're getting bookmarks from a specific folder
      if (folderId) {
        return await this.getBookmarksFromFolder(userId, folderId, paginationToken);
      }
      
      // Create a Twitter API client with the stored credentials
      this.authClient = new auth.OAuth2User({
        client_id: X_CLIENT_ID,
        client_secret: X_CLIENT_SECRET,
        callback: X_REDIRECT_URI,
        scopes: REQUIRED_SCOPES,
        token: {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || '',
          expires_at: credentials.token_expires_at?.getTime() || 0,
          token_type: 'bearer'
        }
      });
      
      const client = new Client(this.authClient);
      
      try {
        // Use the SDK to fetch bookmarks
        const bookmarksResponse = await client.bookmarks.getUsersIdBookmarks(credentials.x_user_id, {
          "expansions": [
            "author_id",
            "attachments.media_keys",
            "referenced_tweets.id",
            "referenced_tweets.id.author_id"
          ],
          "tweet.fields": [
            "created_at",
            "public_metrics",
            "entities",
            "attachments"
          ],
          "user.fields": [
            "name",
            "username",
            "profile_image_url"
          ],
          "media.fields": [
            "url",
            "preview_image_url",
            "alt_text",
            "type",
            "width",
            "height"
          ],
          "max_results": 100,
          "pagination_token": paginationToken
        });
        
        if (!bookmarksResponse.data) {
          // No bookmarks found, return empty arrays
          return { tweets: [], users: {}, media: {} };
        }
        
        // Convert SDK response to our internal format
        const tweets = bookmarksResponse.data.map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.author_id,
          public_metrics: tweet.public_metrics,
          entities: tweet.entities,
          attachments: tweet.attachments,
          // Initialize local_media as empty array for each tweet
          local_media: []
        }));
        
        // Extract users from includes
        const users: { [key: string]: XUser } = {};
        if (bookmarksResponse.includes && bookmarksResponse.includes.users) {
          bookmarksResponse.includes.users.forEach(user => {
            users[user.id] = {
              id: user.id,
              name: user.name,
              username: user.username,
              profile_image_url: user.profile_image_url
            };
          });
        }
        
        // Extract media from includes
        const media: { [key: string]: XMedia } = {};
        if (bookmarksResponse.includes && bookmarksResponse.includes.media) {
          bookmarksResponse.includes.media.forEach((mediaItem: any) => {
            media[mediaItem.media_key] = {
              media_key: mediaItem.media_key,
              type: mediaItem.type,
              url: mediaItem.url || mediaItem.preview_image_url,
              preview_image_url: mediaItem.preview_image_url,
              width: mediaItem.width,
              height: mediaItem.height,
              alt_text: mediaItem.alt_text
            };
          });
        }
        
        // Extract next pagination token if available
        const nextToken = bookmarksResponse.meta?.next_token;
        
        return { tweets, users, nextToken, media };
      } catch (error) {
        console.error('Error fetching bookmarks:', error);
        throw new Error(`Failed to get bookmarks: ${error}`);
      }
    } catch (error) {
      console.error('Error in getBookmarks:', error);
      throw error;
    }
  }
  
  /**
   * Get user's bookmarked tweets from a specific folder
   */
  async getBookmarksFromFolder(userId: string, folderId: string, paginationToken?: string): Promise<{
    tweets: XTweet[],
    users: { [key: string]: XUser },
    media: { [key: string]: XMedia },
    nextToken?: string
  }> {
    // Get user credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    try {
      console.log(`X Folders: Fetching bookmarks from folder ${folderId} for user ${userId}`);
      
      // Create the authenticated URL using the user's credentials
      const url = new URL(`${X_API_BASE}/2/users/${credentials.x_user_id}/bookmarks/folders/${folderId}`);
      
      // Add query parameters
      const params = new URLSearchParams();
      params.append("expansions", "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id");
      params.append("tweet.fields", "created_at,public_metrics,entities,attachments");
      params.append("user.fields", "name,username,profile_image_url");
      params.append("media.fields", "url,preview_image_url,alt_text,type,width,height");
      params.append("max_results", "100");
      
      if (paginationToken) {
        params.append("pagination_token", paginationToken);
      }
      
      url.search = params.toString();
      
      // Make the request with the user's access token
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X Folders: Error fetching bookmarks from folder, Status: ${response.status}, Response:`, errorText);
        
        // Check if this is an auth error
        if (response.status === 401) {
          throw new Error('User needs to reconnect');
        }
        
        throw new Error(`Failed to get bookmarks from folder: ${response.status} ${errorText}`);
      }
      
      const data = await response.json() as XApiResponse<any>;
      
      if (!data.data) {
        // No bookmarks found in this folder, return empty arrays
        console.log(`X Folders: No bookmarks found in folder ${folderId}`);
        return { tweets: [], users: {}, media: {} };
      }
      
      // Convert API response to our internal format
      const tweets = data.data.map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        author_id: tweet.author_id,
        public_metrics: tweet.public_metrics,
        entities: tweet.entities,
        attachments: tweet.attachments,
        // Initialize local_media as empty array for each tweet
        local_media: []
      }));
      
      // Extract users from includes
      const users: { [key: string]: XUser } = {};
      if (data.includes && data.includes.users) {
        data.includes.users.forEach((user: any) => {
          users[user.id] = {
            id: user.id,
            name: user.name,
            username: user.username,
            profile_image_url: user.profile_image_url
          };
        });
      }
      
      // Extract media from includes
      const media: { [key: string]: XMedia } = {};
      if (data.includes && data.includes.media) {
        data.includes.media.forEach((mediaItem: any) => {
          media[mediaItem.media_key] = {
            media_key: mediaItem.media_key,
            type: mediaItem.type,
            url: mediaItem.url || mediaItem.preview_image_url,
            preview_image_url: mediaItem.preview_image_url,
            width: mediaItem.width,
            height: mediaItem.height,
            alt_text: mediaItem.alt_text
          };
        });
      }
      
      // Extract next pagination token if available
      const nextToken = data.meta?.next_token;
      
      console.log(`X Folders: Found ${tweets.length} bookmarks in folder ${folderId}`);
      return { tweets, users, nextToken, media };
    } catch (error) {
      console.error(`X Folders: Error fetching bookmarks from folder ${folderId}:`, error);
      throw error;
    }
  }

  /**
   * Convert an X tweet to a bookmark
   * This method is async because it downloads media files
   */
  async convertTweetToBookmark(tweet: XTweet, author?: XUser, mediaMap?: { [key: string]: XMedia }): Promise<InsertBookmark> {
    // Generate a normalized URL for the tweet using x.com instead of twitter.com
    const tweetUrl = `https://x.com/${author?.username || 'user'}/status/${tweet.id}`;
    
    // Use the first part of the tweet as the title (up to 100 chars)
    const title = tweet.text.length > 100 
      ? tweet.text.substring(0, 97) + '...' 
      : tweet.text;
    
    // Use the tweet text as the description
    const description = tweet.text;
    
    // Extract media URLs from entities if available
    const mediaUrls: string[] = [];
    
    // First add URLs from entities
    if (tweet.entities && tweet.entities.urls) {
      tweet.entities.urls.forEach(url => {
        const expandedUrl = typeof url === 'object' && url.expanded_url 
          ? url.expanded_url 
          : typeof url === 'object' && url.url 
            ? url.url 
            : '';
            
        if (expandedUrl) {
          mediaUrls.push(expandedUrl);
        }
      });
    }
    
    // Always initialize/reset the local media array
    // The if/else is redundant, but keeping for clarity
    tweet.local_media = [];
    
    // Then add URLs from media attachments if available
    if (tweet.attachments && tweet.attachments.media_keys && mediaMap) {
      // Use Promise.all to process all media downloads in parallel
      const mediaPromises = tweet.attachments.media_keys.map(async (mediaKey) => {
        const mediaItem = mediaMap[mediaKey];
        if (mediaItem && (mediaItem.url || mediaItem.preview_image_url)) {
          // Use the direct URL if available, otherwise use preview image
          const mediaUrl = mediaItem.url || mediaItem.preview_image_url;
          if (mediaUrl) {
            // Add the original URL to mediaUrls
            mediaUrls.push(mediaUrl);
            
            // Download the media for local storage
            const localPath = await this.downloadAndStoreMedia(
              mediaKey, 
              mediaUrl, 
              tweet.id, 
              mediaItem.type
            );
            
            // If download was successful, store the local path
            if (localPath) {
              // Add to local media files for this tweet
              tweet.local_media.push({
                original_url: mediaUrl,
                local_path: localPath,
                media_key: mediaKey,
                type: mediaItem.type
              });
              
              // Also add the local path to mediaUrls for the bookmark
              mediaUrls.push(localPath);
              
              console.log(`X Sync: Added local media ${localPath} for tweet ${tweet.id}`);
            }
          }
        }
      });
      
      // Wait for all media downloads to complete
      await Promise.all(mediaPromises);
    }
    
    // Create a bookmark
    const bookmark: InsertBookmark = {
      url: tweetUrl,
      title,
      description,
      content_html: null,
      source: 'x',
      date_saved: new Date(),
      user_id: null, // This will be filled in by the calling function
      
      // X.com specific fields
      external_id: tweet.id,
      author_username: author?.username || '',
      author_name: author?.name || '',
      like_count: tweet.public_metrics?.like_count || 0,
      repost_count: tweet.public_metrics?.retweet_count || 0,
      reply_count: tweet.public_metrics?.reply_count || 0,
      // Handle optional quote_count properly
      quote_count: (tweet.public_metrics?.quote_count !== undefined) 
        ? tweet.public_metrics.quote_count 
        : 0,
      media_urls: mediaUrls,
    };
    
    return bookmark;
  }
  
  /**
   * Download and store media locally
   * Returns the local path to the downloaded file, or null if download failed
   */
  private async downloadAndStoreMedia(mediaKey: string, mediaUrl: string, tweetId: string, mediaType: string = 'photo'): Promise<string | null> {
    try {
      // Create directories for media storage if they don't exist
      const mediaDir = `public/media/tweets/${tweetId}`;
      
      // Skip if URL is not valid or is already a local path
      if (!mediaUrl || mediaUrl.startsWith('/')) {
        return null;
      }
      
      console.log(`X Sync: Downloading media from ${mediaUrl} for tweet ${tweetId}`);
      
      // Ensure the directory exists
      const mkdir = promisify(fs.mkdir);
      
      try {
        await mkdir(mediaDir, { recursive: true });
      } catch (mkdirError) {
        console.error(`X Sync: Error creating media directory for tweet ${tweetId}:`, mkdirError);
        return null;
      }
      
      // Get file extension from URL or default based on media type
      let fileExt;
      try {
        const urlPath = new URL(mediaUrl).pathname;
        fileExt = path.extname(urlPath);
      } catch (urlError) {
        // If URL parsing fails, use default extension based on media type
        fileExt = '';
      }
      
      // Set default extension based on media type if not found in URL
      if (!fileExt) {
        switch(mediaType) {
          case 'photo':
            fileExt = '.jpg';
            break;
          case 'video':
            fileExt = '.mp4';
            break;
          case 'animated_gif':
            fileExt = '.gif';
            break;
          default:
            fileExt = '.jpg';
        }
      }
      
      // Create a unique filename based on the media key
      const fileName = `${mediaKey}${fileExt}`;
      const filePath = path.join(mediaDir, fileName);
      
      // Download the media file
      try {
        const response = await fetch(mediaUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Save the file
        const buffer = await response.buffer();
        await fs.promises.writeFile(filePath, buffer);
        
        console.log(`X Sync: Successfully downloaded media to ${filePath}`);
        
        // Create a relative URL that can be used in the app
        const relativeUrl = `/media/tweets/${tweetId}/${fileName}`;
        
        return relativeUrl;
      } catch (fetchError) {
        console.error(`X Sync: Error fetching media from ${mediaUrl}:`, fetchError);
        return null;
      }
    } catch (error) {
      console.error(`X Sync: Error downloading media for tweet ${tweetId}:`, error);
      return null;
    }
  }

  /**
   * Get user's bookmark folders from X.com
   * Supports pagination to ensure all folders are retrieved
   * Includes rate limiting protection
   */
  async getFolders(userId: string, paginationToken?: string): Promise<{ folders: XFolderData[], nextToken?: string, rateLimit?: boolean }> {
    // Get user credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    // Ensure token is valid
    await this.ensureValidToken(userId);
    
    try {
      console.log(`X Folders: Fetching bookmark folders for user ${userId}${paginationToken ? ' with pagination token' : ''}`);
      
      // Create the authenticated URL using the user's credentials
      let url = `${X_API_BASE}/2/users/${credentials.x_user_id}/bookmarks/folders`;
      
      // Add pagination token if provided
      if (paginationToken) {
        url += `?pagination_token=${paginationToken}`;
      }
      
      // Add a delay to prevent rate limiting (500ms)
      if (paginationToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Make the request with the user's access token
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X Folders: Error fetching folders, Status: ${response.status}, Response:`, errorText);
        
        // Check if this is an auth error
        if (response.status === 401) {
          throw new Error('User needs to reconnect');
        }
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          console.log('X Folders: Rate limit exceeded, waiting before retry');
          // If this is a rate limit error, wait and return empty for now
          // The client can retry later
          return { folders: [], rateLimit: true };
        }
        
        throw new Error(`Failed to get folders: ${response.status} ${errorText}`);
      }
      
      const data = await response.json() as XApiResponse<XFolderData[]>;
      
      if (!data.data) {
        // No folders found or API doesn't support folders yet
        console.log('X Folders: No folders found or API returned an empty response');
        return { folders: [] };
      }
      
      console.log(`X Folders: Found ${data.data.length} folders${data.meta?.next_token ? ' with more available' : ''}`);
      
      return { 
        folders: data.data,
        nextToken: data.meta?.next_token
      };
    } catch (error) {
      console.error('X Folders: Error fetching folders:', error);
      throw error;
    }
  }
  
  /**
   * Get all user's bookmark folders from X.com
   * First checks database for stored folders, then fetches from API only if needed
   * Includes rate limiting protection with exponential backoff
   */
  async getAllFolders(userId: string, forceRefresh = false): Promise<XFolderData[]> {
    console.log(`X Folders: Getting all folders for user ${userId}, forceRefresh=${forceRefresh}`);
    
    // First, try to get folders from database if not forcing refresh
    if (!forceRefresh) {
      try {
        // Check if we have recently synced folders in the database
        console.log(`X Folders: Checking database for stored folders`);
        const storedFolders = await storage.getStoredXFolders(userId);
        
        if (storedFolders && storedFolders.length > 0) {
          // Convert database folders to the format expected by the API
          const folderData: XFolderData[] = storedFolders.map(folder => ({
            id: folder.x_folder_id,
            name: folder.x_folder_name
          }));
          
          console.log(`X Folders: Found ${folderData.length} folders in database, using cached data`);
          return folderData;
        }
        
        console.log(`X Folders: No stored folders found, fetching from API`);
      } catch (dbError) {
        console.error('X Folders: Error fetching folders from database:', dbError);
        // Continue to fetch from API if database fails
      }
    } else {
      console.log(`X Folders: Force refresh requested, skipping database check`);
    }
    
    // If we get here, we need to fetch from the API
    let allFolders: XFolderData[] = [];
    let nextToken: string | undefined = undefined;
    let retryCount = 0;
    const maxRetries = 3;
    let pageCount = 0;
    
    try {
      do {
        try {
          pageCount++;
          console.log(`X Folders: Fetching page ${pageCount} of folders from API${nextToken ? ' with pagination token' : ''}`);
          
          // Get a batch of folders
          const result = await this.getFolders(userId, nextToken);
          
          // Check if we hit a rate limit
          if ('rateLimit' in result && result.rateLimit) {
            retryCount++;
            if (retryCount <= maxRetries) {
              // Wait with exponential backoff: 1s, 2s, 4s
              const waitTime = Math.pow(2, retryCount - 1) * 1000;
              console.log(`X Folders: Rate limited, retry ${retryCount}/${maxRetries} after ${waitTime}ms`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue; // Try the same request again
            } else {
              console.log(`X Folders: Max retries reached (${maxRetries}), returning current results`);
              break; // Exit the loop, return what we have so far
            }
          }
          
          // Reset retry count on successful requests
          retryCount = 0;
          
          // Add folders to our collection
          allFolders = [...allFolders, ...result.folders];
          
          // Save previous token for debugging
          const prevToken = nextToken;
          
          // Update the pagination token for the next request
          nextToken = result.nextToken;
          
          // Log pagination status
          if (nextToken) {
            console.log(`X Folders: More folders available, next token: ${nextToken.substring(0, 10)}...`);
          }
          
          // If we got folders but no next token, we're at the end
          if (result.folders.length > 0 && !nextToken) {
            console.log(`X Folders: Retrieved all ${allFolders.length} folders successfully from API`);
          }
          
          // If we get the same token twice, we're stuck in a loop - break
          if (prevToken && prevToken === nextToken) {
            console.log(`X Folders: Detected same pagination token twice, breaking pagination loop`);
            break;
          }
          
          // Add a delay between pages to avoid rate limiting
          if (nextToken) {
            console.log(`X Folders: Waiting 1500ms before fetching next page`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (pageError) {
          console.error('X Folders: Error fetching page:', pageError);
          retryCount++;
          
          if (retryCount <= maxRetries) {
            // Wait with exponential backoff: 1s, 2s, 4s
            const waitTime = Math.pow(2, retryCount - 1) * 1000;
            console.log(`X Folders: Error, retry ${retryCount}/${maxRetries} after ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.log(`X Folders: Max retries reached (${maxRetries}), returning current results`);
            break; // Exit the loop, return what we have so far
          }
        }
      } while (nextToken || (retryCount > 0 && retryCount <= maxRetries)); // Continue until there are no more pages or max retries reached
      
      console.log(`X Folders: Pagination complete, retrieved ${allFolders.length} total folders from ${pageCount} pages`);
      
      // Store folders in database for future use
      if (allFolders.length > 0) {
        await this.storeFoldersInDatabase(userId, allFolders);
      }
      
      return allFolders;
      
    } catch (error) {
      console.error('X Folders: Error fetching all folders:', error);
      // Return empty array on error to avoid breaking the application
      return [];
    }
  }
  
  /**
   * Store folders in database for future use
   */
  private async storeFoldersInDatabase(userId: string, folders: XFolderData[]): Promise<void> {
    try {
      console.log(`X Folders: Storing ${folders.length} folders in database for user ${userId}`);
      
      // First, get existing mappings to preserve collection associations
      const existingMappings = await storage.getXFoldersByUserId(userId);
      const existingMappingsMap = new Map<string, string | null>();
      
      // Create a map of folder ID to collection ID
      existingMappings.forEach(mapping => {
        existingMappingsMap.set(mapping.x_folder_id, mapping.collection_id);
      });
      
      // For each folder, update or insert it into the database
      for (const folder of folders) {
        // Check if folder already exists in database
        const existingMapping = existingMappings.find(m => m.x_folder_id === folder.id);
        
        if (existingMapping) {
          // Update existing folder
          console.log(`X Folders: Updating existing folder mapping for ${folder.name} (${folder.id})`);
          
          await storage.updateXFolder(existingMapping.id, {
            x_folder_name: folder.name,
            // Keep existing collection mapping
            collection_id: existingMapping.collection_id,
            // Update last sync time
            last_sync_at: new Date()
          });
        } else {
          // Create new folder mapping
          console.log(`X Folders: Creating new folder mapping for ${folder.name} (${folder.id})`);
          
          const newMapping: InsertXFolder = {
            user_id: userId,
            x_folder_id: folder.id,
            x_folder_name: folder.name,
            // No collection mapping yet
            collection_id: null,
            // Set last sync time
            last_sync_at: new Date()
          };
          
          await storage.createXFolder(newMapping);
        }
      }
      
      console.log(`X Folders: Successfully stored all folders in database`);
    } catch (error) {
      console.error('X Folders: Error storing folders in database:', error);
      // Don't throw, just log error to avoid breaking the application
    }
  }

  /**
   * Sync bookmarks from X.com to our database
   * Includes bookmarks from folders if available
   */
  async syncBookmarks(userId: string): Promise<{ added: number, updated: number, errors: number }> {
    console.log(`X Sync: Starting bookmark sync for user ${userId}`);
    
    // Track statistics
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    // Get all bookmarks from X.com
    let allBookmarks: { 
      tweets: XTweet[], 
      users: { [key: string]: XUser },
      media: { [key: string]: XMedia },
      // Add a map to track which tweets came from which folders
      folderTweetMap: Map<string, Set<string>>
    } = { 
      tweets: [], 
      users: {},
      media: {},
      folderTweetMap: new Map<string, Set<string>>()
    };
    
    // Create a cache to hold existing bookmark metadata for more efficient updates
    const existingBookmarkCache = new Map<string, Bookmark>();
    
    try {
      // Check if user has valid X.com credentials
      const credentials = await this.getUserCredentials(userId);
      if (!credentials) {
        console.error(`X Sync: User ${userId} is not connected to X.com`);
        throw new Error('User is not connected to X.com');
      }
      console.log(`X Sync: Found credentials for user ${userId}, username: ${credentials.x_username}`);
      
      // Check if token is expired
      const isTokenExpired = credentials.token_expires_at && credentials.token_expires_at < new Date();
      
      // If token is expired and we have a refresh token, try to refresh it
      if (isTokenExpired) {
        console.log(`X Sync: Token expired, attempting to refresh...`);
        
        // Check if we have a refresh token
        if (!credentials.refresh_token) {
          console.error(`X Sync: No refresh token available for user ${userId}`);
          return { 
            added: 0, 
            updated: 0, 
            errors: 1 
          };
        }
        
        try {
          // Try to refresh the token
          const refreshedCreds = await this.refreshAccessToken(credentials.refresh_token);
          await storage.updateXCredentials(credentials.id, refreshedCreds);
          console.log(`X Sync: Token refreshed successfully`);
        } catch (refreshError) {
          console.error(`X Sync: Failed to refresh token:`, refreshError);
          // Token refresh failed, user needs to re-authenticate
          console.log(`X Sync: User needs to reconnect to X.com`);
          
          return { 
            added: 0, 
            updated: 0, 
            errors: 1 
          };
        }
      }
      
      // Fetch existing bookmarks for this user to avoid duplicates and optimize updates
      const existingXBookmarks = await this.getExistingXBookmarks(userId);
      console.log(`X Sync: Found ${existingXBookmarks.size} existing X.com bookmarks`);
      
      // For each existing bookmark, store it in our cache so we can access it quickly later
      // Convert keys() to array to avoid TypeScript error with Map iterator
      Array.from(existingXBookmarks.keys()).forEach(bookmarkId => {
        const bookmark = existingXBookmarks.get(bookmarkId);
        if (bookmark) {
          existingBookmarkCache.set(bookmarkId, bookmark);
        }
      });
      
      // Step 1: Try to fetch folders with pagination (this will use the undocumented API endpoint)
      try {
        console.log(`X Sync: Attempting to fetch all folders for user ${userId}`);
        const allFolders = await this.getAllFolders(userId);
        
        if (allFolders.length > 0) {
          console.log(`X Sync: Found ${allFolders.length} folders using pagination, syncing bookmarks from each folder`);
          
          // For each folder, fetch bookmarks and add them to allBookmarks
          for (const folder of allFolders) {
            console.log(`X Sync: Processing folder ${folder.name} (${folder.id})`);
            // Pass allBookmarks including folderTweetMap for tracking folder-tweet associations
            await this.syncBookmarksFromFolder(userId, folder, allBookmarks, existingBookmarkCache);
          }
        } else {
          console.log(`X Sync: No folders found or folder API not available`);
        }
      } catch (folderError) {
        // If folder API fails, just log the error and continue with main bookmarks
        console.error(`X Sync: Error fetching or processing folders:`, folderError);
        console.log(`X Sync: Continuing with main bookmarks sync`);
      }
    } catch (setupError) {
      console.error(`X Sync: Error in sync setup:`, setupError);
      return { added: 0, updated: 0, errors: 1 };
    }
    
    // Step 2: Now fetch the main bookmarks (unfiled bookmarks)
    try {
      console.log(`X Sync: Fetching unfiled bookmarks`);
      let nextToken: string | undefined = undefined;
      
      // Fetch bookmarks with pagination
      do {
        try {
          console.log(`X Sync: Fetching bookmarks${nextToken ? ' with pagination token' : ''}`);
          const result = await this.getBookmarks(userId, nextToken);
          console.log(`X Sync: Fetched ${result.tweets.length} tweets, ${Object.keys(result.users).length} users, and ${Object.keys(result.media).length} media items`);
          
          allBookmarks.tweets = [...allBookmarks.tweets, ...result.tweets];
          allBookmarks.users = { ...allBookmarks.users, ...result.users };
          allBookmarks.media = { ...allBookmarks.media, ...result.media };
          nextToken = result.nextToken;
          
          if (nextToken) {
            console.log(`X Sync: More bookmarks available, will paginate`);
          }
        } catch (error) {
          console.error('X Sync: Error fetching bookmarks from X.com:', error);
          errors++;
          break;
        }
      } while (nextToken);
    } catch (mainSyncError) {
      console.error(`X Sync: Error fetching main bookmarks:`, mainSyncError);
      errors++;
    }
    
    console.log(`X Sync: Total fetched - ${allBookmarks.tweets.length} tweets, ${Object.keys(allBookmarks.users).length} users, and ${Object.keys(allBookmarks.media).length} media items`);
    
    // Step 3: Process all the collected bookmarks
    // Use a Set to track processed tweet IDs to avoid duplicates from different folders
    const processedTweetIds = new Set<string>();
    
    for (const tweet of allBookmarks.tweets) {
      try {
        // Skip if we've already processed this tweet (could be in multiple folders)
        if (processedTweetIds.has(tweet.id)) {
          continue;
        }
        
        processedTweetIds.add(tweet.id);
        const author = tweet.author_id ? allBookmarks.users[tweet.author_id] : undefined;
        
        // Check if bookmark already exists in our cache
        const existingBookmark = existingBookmarkCache.get(tweet.id);
        
        if (existingBookmark) {
          // Bookmark exists - only update engagement metrics, preserving user customizations
          console.log(`X Sync: Updating engagement metrics for existing bookmark (tweet ${tweet.id})`);
          
          // Extract just the engagement metrics
          // Note: updated_at isn't part of InsertBookmark, we handle this at the database level
          const updateData: Partial<InsertBookmark> = {
            like_count: tweet.public_metrics?.like_count,
            repost_count: tweet.public_metrics?.retweet_count,
            reply_count: tweet.public_metrics?.reply_count,
            quote_count: tweet.public_metrics?.quote_count
          };
          
          // Update only the engagement metrics for the existing bookmark
          await storage.updateBookmark(existingBookmark.id, updateData);
          updated++;
        } else {
          // This is a new bookmark - create it with all data
          console.log(`X Sync: Creating new bookmark for tweet ${tweet.id}`);
          
          // Convert tweet to full bookmark (now async to handle media downloads)
          const bookmarkData = await this.convertTweetToBookmark(tweet, author, allBookmarks.media);
          bookmarkData.user_id = userId;
          
          // Log if we downloaded any media
          if (tweet.local_media && tweet.local_media.length > 0) {
            console.log(`X Sync: Downloaded ${tweet.local_media.length} media files for tweet ${tweet.id}`);
          }
          
          // Create the new bookmark
          const newBookmark = await storage.createBookmark(bookmarkData);
          added++;
          
          // Check if this tweet belongs to any mapped folders
          // We'll look for mapped collections and add the bookmark to them
          try {
            // Get all folder IDs where this tweet belongs
            // Use Array.from to avoid TypeScript iterator issues
            for (const entry of Array.from(allBookmarks.folderTweetMap.entries())) {
              const folderId = entry[0];
              const tweetIds = entry[1];
              if (tweetIds.has(tweet.id)) {
                console.log(`X Sync: Tweet ${tweet.id} belongs to folder ${folderId}`);
                
                // Look up the folder-to-collection mapping
                const [folderMapping] = await db.select()
                  .from(xFolders)
                  .where(
                    and(
                      eq(xFolders.user_id, userId),
                      eq(xFolders.x_folder_id, folderId)
                    )
                  );
                
                // If the folder has a mapped collection, add the bookmark to it
                if (folderMapping && folderMapping.collection_id) {
                  console.log(`X Sync: Adding bookmark ${newBookmark.id} to collection ${folderMapping.collection_id} (mapped from folder ${folderId})`);
                  
                  // Add the bookmark to the mapped collection
                  await storage.addBookmarkToCollection(folderMapping.collection_id, newBookmark.id);
                }
              }
            }
          } catch (collectionError) {
            console.error(`X Sync: Error adding bookmark to collections:`, collectionError);
            // Continue processing other bookmarks even if this one fails
          }
        }
      } catch (error) {
        console.error(`X Sync: Error processing tweet ${tweet.id}:`, error);
        errors++;
      }
    }
    
    // Update last sync time
    try {
      console.log(`X Sync: Updating last sync time for user ${userId}`);
      await this.updateLastSync(userId);
    } catch (error) {
      console.error(`X Sync: Error updating last sync time:`, error);
    }
    
    console.log(`X Sync: Finished - Added: ${added}, Updated: ${updated}, Errors: ${errors}`);
    return { added, updated, errors };
  }
  
  /**
   * Sync bookmarks from a specific X.com folder
   * This adds bookmarks to the allBookmarks object
   */
  private async syncBookmarksFromFolder(
    userId: string, 
    folder: XFolderData, 
    allBookmarks: {
      tweets: XTweet[],
      users: { [key: string]: XUser },
      media: { [key: string]: XMedia },
      // Add a map to track which tweets came from which folders
      folderTweetMap: Map<string, Set<string>>
    },
    existingBookmarkCache: Map<string, Bookmark>
  ): Promise<void> {
    console.log(`X Sync: Syncing bookmarks from folder "${folder.name}" (${folder.id})`);
    
    let nextToken: string | undefined = undefined;
    
    try {
      // Fetch bookmarks from this folder with pagination
      do {
        try {
          console.log(`X Sync: Fetching bookmarks from folder ${folder.id}${nextToken ? ' with pagination token' : ''}`);
          const result = await this.getBookmarksFromFolder(userId, folder.id, nextToken);
          console.log(`X Sync: Fetched ${result.tweets.length} tweets from folder ${folder.id}`);
          
          // Add the tweets, users, and media to our collection
          allBookmarks.tweets = [...allBookmarks.tweets, ...result.tweets];
          allBookmarks.users = { ...allBookmarks.users, ...result.users };
          allBookmarks.media = { ...allBookmarks.media, ...result.media };
          
          // Track which tweets belong to this folder
          if (result.tweets.length > 0) {
            // Get or create a Set for this folder
            let folderTweets = allBookmarks.folderTweetMap.get(folder.id);
            if (!folderTweets) {
              folderTweets = new Set<string>();
              allBookmarks.folderTweetMap.set(folder.id, folderTweets);
            }
            
            // Add each tweet ID to the folder's Set
            result.tweets.forEach(tweet => folderTweets!.add(tweet.id));
            console.log(`X Sync: Tracked ${result.tweets.length} tweets for folder ${folder.id}`);
          }
          
          nextToken = result.nextToken;
          
          if (nextToken) {
            console.log(`X Sync: More bookmarks available in folder ${folder.id}, will paginate`);
          }
        } catch (error) {
          console.error(`X Sync: Error fetching bookmarks from folder ${folder.id}:`, error);
          break;
        }
      } while (nextToken);
      
      // Look up or create a collection mapping for this folder
      await this.ensureFolderCollection(userId, folder);
      
    } catch (error) {
      console.error(`X Sync: Error syncing bookmarks from folder ${folder.id}:`, error);
    }
  }
  
  /**
   * Ensure a folder has a corresponding entry in our system
   * Only updates sync times for existing mappings, does not auto-create collections
   */
  private async ensureFolderCollection(userId: string, folder: XFolderData): Promise<void> {
    try {
      // Check if there's already a mapping for this folder
      const [existingMapping] = await db.select()
        .from(xFolders)
        .where(
          and(
            eq(xFolders.user_id, userId),
            eq(xFolders.x_folder_id, folder.id)
          )
        );
      
      if (existingMapping) {
        // Update the last sync time for this folder mapping
        await storage.updateXFolderLastSync(existingMapping.id);
        console.log(`X Sync: Updated last sync time for folder "${folder.name}" (${folder.id})`);
      } else {
        // We found a folder that doesn't have a mapping yet
        // Just log it, don't automatically create a collection
        console.log(`X Sync: Found unmapped folder "${folder.name}" (${folder.id})`);
        
        // Check if we already have a record of this folder
        const [existingFolder] = await db.select()
          .from(xFolders)
          .where(
            and(
              eq(xFolders.user_id, userId),
              eq(xFolders.x_folder_id, folder.id)
            )
          );
        
        if (!existingFolder) {
          // Create folder entry without mapping it to a collection
          const newMapping: InsertXFolder = {
            user_id: userId,
            x_folder_id: folder.id,
            x_folder_name: folder.name,
            // No collection mapping
            collection_id: null,
            // Set last sync time
            last_sync_at: new Date()
          };
          
          await storage.createXFolder(newMapping);
          console.log(`X Sync: Created folder record without collection mapping for "${folder.name}" (${folder.id})`);
        }
      }
    } catch (error) {
      console.error(`X Sync: Error ensuring folder entry for ${folder.id}:`, error);
    }
  }

  /**
   * Create a new collection from an X.com folder
   */
  async createCollectionFromFolder(userId: string, folderData: { id: string, name: string }): Promise<XFolder> {
    // Create a new collection
    const collection: InsertCollection = {
      name: folderData.name,
      description: `Imported from X.com folder`,
      user_id: userId,
      is_public: false,
    };
    
    const newCollection = await storage.createCollection(collection);
    
    // Create folder mapping
    const folderMapping: InsertXFolder = {
      user_id: userId,
      x_folder_id: folderData.id,
      x_folder_name: folderData.name,
      collection_id: newCollection.id,
    };
    
    // Store in database
    return await this.createFolderMapping(folderMapping);
  }

  /**
   * Map an X.com folder to an existing collection
   */
  async mapFolderToCollection(userId: string, folderData: { id: string, name: string }, collectionId: string): Promise<XFolder> {
    // Create folder mapping
    const folderMapping: InsertXFolder = {
      user_id: userId,
      x_folder_id: folderData.id,
      x_folder_name: folderData.name,
      collection_id: collectionId,
    };
    
    // Store in database
    return await this.createFolderMapping(folderMapping);
  }

  /**
   * Update last sync time for a user
   */
  private async updateLastSync(userId: string): Promise<void> {
    // Find user's X.com credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    // Update last sync time
    await db.update(xCredentials)
      .set({ 
        last_sync_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(xCredentials.id, credentials.id));
  }

  /**
   * Find an existing bookmark by external_id
   */
  private async findExistingBookmark(userId: string, tweetId: string): Promise<Bookmark | undefined> {
    const [bookmark] = await db.select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.user_id, userId),
          eq(bookmarks.external_id, tweetId),
          eq(bookmarks.source, 'x')
        )
      );
    
    return bookmark;
  }

  /**
   * Create a new folder mapping
   */
  private async createFolderMapping(folderMapping: InsertXFolder): Promise<XFolder> {
    const [folder] = await db.insert(xFolders)
      .values({
        ...folderMapping,
        last_sync_at: new Date()
      })
      .returning();
    
    return folder;
  }

  /**
   * Ensure access token is valid, refresh if needed
   */
  private async ensureValidToken(userId: string): Promise<string> {
    // Find user's X.com credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    // Check if token is expired or about to expire (within 5 minutes)
    const now = new Date();
    const expiresAt = credentials.token_expires_at || new Date();
    const expiresInMs = expiresAt.getTime() - now.getTime();
    
    // If token expires in less than 5 minutes, refresh it
    if (expiresInMs < 5 * 60 * 1000 && credentials.refresh_token) {
      // Refresh the token
      const updated = await this.refreshAccessToken(credentials.refresh_token);
      
      // Update in database
      await db.update(xCredentials)
        .set(updated)
        .where(eq(xCredentials.id, credentials.id));
      
      return updated.access_token as string;
    }
    
    return credentials.access_token;
  }

  /**
   * Get X.com credentials for a user
   */
  private async getUserCredentials(userId: string): Promise<XCredentials | undefined> {
    const [credentials] = await db.select()
      .from(xCredentials)
      .where(eq(xCredentials.user_id, userId));
    
    return credentials;
  }
  
  /**
   * Fetch all existing X.com bookmarks for a user
   * This builds a cache of tweet_id -> bookmark mappings to optimize the sync process
   * Returns a Map where the key is the tweet ID (external_id) and the value is the bookmark
   */
  private async getExistingXBookmarks(userId: string): Promise<Map<string, Bookmark>> {
    console.log(`X Sync: Fetching existing X.com bookmarks for user ${userId}`);
    
    const xBookmarks = await db.select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.user_id, userId),
          eq(bookmarks.source, 'x')
        )
      );
    
    // Create a Map for O(1) lookups during sync
    const bookmarkMap = new Map<string, Bookmark>();
    
    for (const bookmark of xBookmarks) {
      if (bookmark.external_id) {
        bookmarkMap.set(bookmark.external_id, bookmark);
      }
    }
    
    console.log(`X Sync: Found ${bookmarkMap.size} existing X.com bookmarks`);
    return bookmarkMap;
  }
  
  /**
   * Delete a user's X.com credentials - used when tokens are invalid
   */
  async deleteUserCredentials(userId: string): Promise<boolean> {
    try {
      console.log(`XService: Deleting X credentials for user ${userId}`);
      
      // Get the credentials first to have the ID
      const credentials = await this.getUserCredentials(userId);
      
      if (!credentials) {
        console.log(`XService: No credentials found for user ${userId}`);
        return false;
      }
      
      // Delete all credentials for this user
      await db.delete(xCredentials)
        .where(eq(xCredentials.user_id, userId));
      
      console.log(`XService: Successfully deleted X credentials for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`XService: Error deleting X credentials:`, error);
      return false;
    }
  }

  /**
   * Generate a fixed code verifier for PKCE
   * Using a static key provided for consistency between server and client
   */
  private generateCodeVerifier(): string {
    // Using a fixed string to ensure consistency with client
    // In a production app, this should be randomly generated and stored in the session
    console.log("XService: Generating fixed code verifier");
    const verifier = "Y7$gVm29#pKfLq*1dC!xZehWTJr@u38oRnXs^BQa6E4NtiUw0+vYMkb9sjGl5HD%";
    console.log("XService: Code verifier length:", verifier.length);
    return verifier;
  }

  /**
   * Generate a code challenge from a code verifier
   */
  private generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }
}

// Export a singleton instance
export const xService = new XService();