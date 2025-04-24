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
import { processMediaUrls } from './media-downloader';
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
    media?: Array<{
      media_url_https?: string;
      media_url?: string;
      url?: string;
      type?: string;
    }>;
  };
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
  async getBookmarks(userId: string, paginationToken?: string): Promise<{ tweets: XTweet[], users: { [key: string]: XUser }, nextToken?: string }> {
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
          "author_id"
        ],
        "tweet.fields": [
          "created_at",
          "public_metrics",
          "entities"
        ],
        "user.fields": [
          "name",
          "username",
          "profile_image_url"
        ],
        "max_results": 100,
        "pagination_token": paginationToken
      });
      
      if (!bookmarksResponse.data) {
        // No bookmarks found, return empty arrays
        return { tweets: [], users: {} };
      }
      
      // Convert SDK response to our internal format
      const tweets = bookmarksResponse.data.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        author_id: tweet.author_id,
        public_metrics: tweet.public_metrics,
        entities: tweet.entities
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
      
      // Extract next pagination token if available
      const nextToken = bookmarksResponse.meta?.next_token;
      
      return { tweets, users, nextToken };
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
      throw new Error(`Failed to get bookmarks: ${error}`);
    }
  }

  /**
   * Convert an X tweet to a bookmark
   */
  async convertTweetToBookmark(tweet: XTweet, author?: XUser, accessToken?: string): Promise<InsertBookmark> {
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
    if (tweet.entities && tweet.entities.urls) {
      // With the Twitter API SDK, the entities.urls might have a different structure
      tweet.entities.urls.forEach(url => {
        // The expanded_url might be undefined in the SDK response
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
    
    // Also check for media entities if available (photos, videos, etc.)
    if (tweet.entities && tweet.entities.media) {
      tweet.entities.media.forEach((media: any) => {
        if (media.media_url_https) {
          mediaUrls.push(media.media_url_https);
        } else if (media.media_url) {
          mediaUrls.push(media.media_url);
        } else if (media.url) {
          mediaUrls.push(media.url);
        }
      });
    }
    
    // Download media files and get local paths
    console.log(`Processing ${mediaUrls.length} media URLs for tweet ${tweet.id}`);
    const localMediaPaths = await processMediaUrls(mediaUrls, accessToken);
    console.log(`Downloaded ${localMediaPaths.length} media files for tweet ${tweet.id}`);
    
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
      local_media_paths: localMediaPaths.length > 0 ? localMediaPaths : null,
    };
    
    return bookmark;
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
    // Track statistics
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    // Get all bookmarks from X.com
    let allBookmarks: { tweets: XTweet[], users: { [key: string]: XUser } } = { tweets: [], users: {} };
    let nextToken: string | undefined = undefined;
    
    do {
      try {
        const result = await this.getBookmarks(userId, nextToken);
        allBookmarks.tweets = [...allBookmarks.tweets, ...result.tweets];
        allBookmarks.users = { ...allBookmarks.users, ...result.users };
        nextToken = result.nextToken;
      } catch (error) {
        console.error('Error fetching bookmarks from X.com:', error);
        errors++;
        break;
      }
    } while (nextToken);
    
    // Get access token for media downloads
    const accessToken = await this.ensureValidToken(userId);
    console.log(`Syncing ${allBookmarks.tweets.length} bookmarks from X.com for user ${userId}`);
    
    // Process each bookmark
    for (const tweet of allBookmarks.tweets) {
      try {
        const author = tweet.author_id ? allBookmarks.users[tweet.author_id] : undefined;
        // Pass the access token to download media
        let bookmarkData = await this.convertTweetToBookmark(tweet, author, accessToken);
        
        // Set user ID for the bookmark
        bookmarkData = {
          ...bookmarkData,
          user_id: userId
        };
        
        // Check if bookmark already exists
        const existingBookmark = await this.findExistingBookmark(userId, tweet.id);
        
        if (existingBookmark) {
          // Update existing bookmark
          await storage.updateBookmark(existingBookmark.id, bookmarkData);
          updated++;
        } else {
          // Create new bookmark
          await storage.createBookmark(bookmarkData);
          added++;
        }
      } catch (error) {
        console.error(`Error processing tweet ${tweet.id}:`, error);
        errors++;
      }
    }
    
    // Update last sync time
    await this.updateLastSync(userId);
    
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
      try {
        // Refresh the token
        const updated = await this.refreshAccessToken(credentials.refresh_token);
        
        // Update in database
        await db.update(xCredentials)
          .set(updated)
          .where(eq(xCredentials.id, credentials.id));
        
        return updated.access_token as string;
      } catch (error) {
        console.error('Error refreshing token:', error);
        // If refresh fails, return existing token - it might still work
        // Or the user needs to re-authenticate
        return credentials.access_token;
      }
    }
    
    return credentials.access_token;
  }

  /**
   * Get X.com credentials for a user
   */
  private async getUserCredentials(userId: string): Promise<XCredentials | undefined> {
    try {
      const [credentials] = await db.select()
        .from(xCredentials)
        .where(eq(xCredentials.user_id, userId));
      
      return credentials;
    } catch (error) {
      console.error(`Error getting X credentials for user ${userId}:`, error);
      // Return null if there's an error to prevent further issues
      return undefined;
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