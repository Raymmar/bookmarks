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
  local_media?: {
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
   */
  async getBookmarks(userId: string, paginationToken?: string): Promise<{ 
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
        attachments: tweet.attachments
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
  }

  /**
   * Convert an X tweet to a bookmark
   */
  convertTweetToBookmark(tweet: XTweet, author?: XUser, mediaMap?: { [key: string]: XMedia }): InsertBookmark {
    // Generate a normalized URL for the tweet
    const tweetUrl = `https://twitter.com/${author?.username || 'user'}/status/${tweet.id}`;
    
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
    
    // Then add URLs from media attachments if available
    if (tweet.attachments && tweet.attachments.media_keys && mediaMap) {
      tweet.attachments.media_keys.forEach(mediaKey => {
        const mediaItem = mediaMap[mediaKey];
        if (mediaItem && (mediaItem.url || mediaItem.preview_image_url)) {
          // Use the direct URL if available, otherwise use preview image
          const mediaUrl = mediaItem.url || mediaItem.preview_image_url;
          if (mediaUrl) {
            mediaUrls.push(mediaUrl);
            
            // Also download the media for local storage
            this.downloadAndStoreMedia(mediaKey, mediaUrl, tweet.id);
          }
        }
      });
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
   * Get user's folders
   */
  async getFolders(accessToken: string, userId: string): Promise<XFolderData[]> {
    // Ensure token is valid
    await this.ensureValidToken(userId);
    
    // TODO: Implement once X API supports folders
    // Currently, the X API does not have an endpoint for retrieving folders
    // This is a placeholder for when it becomes available
    
    return [];
  }

  /**
   * Sync bookmarks from X.com to our database
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
      media: { [key: string]: XMedia }
    } = { 
      tweets: [], 
      users: {},
      media: {}
    };
    let nextToken: string | undefined = undefined;
    
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
    } catch (error) {
      console.error(`X Sync: Error checking credentials:`, error);
      return { added: 0, updated: 0, errors: 1 };
    }
    
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
    
    console.log(`X Sync: Total fetched - ${allBookmarks.tweets.length} tweets, ${Object.keys(allBookmarks.users).length} users, and ${Object.keys(allBookmarks.media).length} media items`);
    
    // Process each bookmark
    for (const tweet of allBookmarks.tweets) {
      try {
        const author = tweet.author_id ? allBookmarks.users[tweet.author_id] : undefined;
        const bookmarkData = this.convertTweetToBookmark(tweet, author, allBookmarks.media);
        bookmarkData.user_id = userId;
        
        // Check if bookmark already exists
        const existingBookmark = await this.findExistingBookmark(userId, tweet.id);
        
        if (existingBookmark) {
          // Update existing bookmark
          console.log(`X Sync: Updating existing bookmark for tweet ${tweet.id}`);
          await storage.updateBookmark(existingBookmark.id, bookmarkData);
          updated++;
        } else {
          // Create new bookmark
          console.log(`X Sync: Creating new bookmark for tweet ${tweet.id}`);
          await storage.createBookmark(bookmarkData);
          added++;
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