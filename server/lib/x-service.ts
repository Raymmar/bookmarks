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

import fetch from 'node-fetch';
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

/**
 * X API configuration
 * These values should be obtained from the X Developer Portal
 */
const X_CLIENT_ID = process.env.X_API_KEY || '';
const X_CLIENT_SECRET = process.env.X_API_SECRET || '';
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || 'https://atmospr.replit.app/api/x/callback';
const X_API_BASE = 'https://api.twitter.com';

/**
 * Scopes needed for reading bookmarks
 */
const REQUIRED_SCOPES = [
  'tweet.read',
  'users.read',
  'bookmark.read',
  'offline.access'
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
    quote_count: number;
  };
  entities?: {
    urls?: Array<{
      url: string;
      expanded_url: string;
      display_url: string;
      media_key?: string;
    }>;
    mentions?: Array<{
      username: string;
      id: string;
    }>;
    hashtags?: Array<{
      tag: string;
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
  /**
   * Generate the OAuth authorization URL for X.com
   */
  getAuthorizationUrl(): string {
    if (!X_CLIENT_ID) {
      throw new Error('X_API_KEY environment variable is not set');
    }

    // Create a PKCE code verifier
    const codeVerifier = this.generateCodeVerifier();
    
    // Store the code verifier in the session
    // TODO: Implement session storage for code verifier
    
    // Create a code challenge from the verifier
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    
    // Create the authorization URL
    const authUrl = new URL(`${X_API_BASE}/2/oauth2/authorize`);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', X_CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', X_REDIRECT_URI);
    authUrl.searchParams.append('scope', REQUIRED_SCOPES.join(' '));
    authUrl.searchParams.append('state', crypto.randomBytes(16).toString('hex'));
    authUrl.searchParams.append('code_challenge', codeChallenge);
    authUrl.searchParams.append('code_challenge_method', 'S256');
    
    return authUrl.toString();
  }

  /**
   * Exchange an authorization code for an access token
   */
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<InsertXCredentials> {
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      throw new Error('X_API_KEY or X_API_SECRET environment variables are not set');
    }

    const tokenUrl = `${X_API_BASE}/2/oauth2/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', X_CLIENT_ID);
    params.append('client_secret', X_CLIENT_SECRET);
    params.append('code', code);
    params.append('code_verifier', codeVerifier);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', X_REDIRECT_URI);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to exchange code for token: ${JSON.stringify(errorData)}`);
    }
    
    const tokenData = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    
    // Get the authenticated user's information
    const userInfo = await this.getUserInfo(tokenData.access_token);
    
    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    
    // Create credentials object
    const credentials: InsertXCredentials = {
      user_id: '', // This will be filled in by the calling function
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      x_user_id: userInfo.id,
      x_username: userInfo.username,
    };
    
    return credentials;
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<Partial<XCredentials>> {
    if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
      throw new Error('X_API_KEY or X_API_SECRET environment variables are not set');
    }

    const tokenUrl = `${X_API_BASE}/2/oauth2/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', X_CLIENT_ID);
    params.append('client_secret', X_CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to refresh token: ${JSON.stringify(errorData)}`);
    }
    
    const tokenData = await response.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    
    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
    
    // Create updated credentials
    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      updated_at: new Date(),
    };
  }

  /**
   * Get the authenticated user's information
   */
  async getUserInfo(accessToken: string): Promise<XUser> {
    const userUrl = `${X_API_BASE}/2/users/me`;
    
    const response = await fetch(userUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to get user info: ${JSON.stringify(errorData)}`);
    }
    
    const userData = await response.json() as XApiResponse<XUser>;
    
    if (!userData.data) {
      throw new Error('No user data returned from X API');
    }
    
    return userData.data;
  }

  /**
   * Get user's bookmarked tweets
   */
  async getBookmarks(accessToken: string, userId: string, paginationToken?: string): Promise<{ tweets: XTweet[], users: { [key: string]: XUser }, nextToken?: string }> {
    // Ensure token is valid
    await this.ensureValidToken(userId);
    
    const bookmarksUrl = new URL(`${X_API_BASE}/2/users/${userId}/bookmarks`);
    
    // Set query parameters for the request
    bookmarksUrl.searchParams.append('expansions', 'author_id');
    bookmarksUrl.searchParams.append('tweet.fields', 'created_at,public_metrics,entities');
    bookmarksUrl.searchParams.append('user.fields', 'name,username,profile_image_url');
    bookmarksUrl.searchParams.append('max_results', '100');
    
    if (paginationToken) {
      bookmarksUrl.searchParams.append('pagination_token', paginationToken);
    }
    
    const response = await fetch(bookmarksUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to get bookmarks: ${JSON.stringify(errorData)}`);
    }
    
    const bookmarksData = await response.json() as XApiResponse<XTweet[]>;
    
    if (!bookmarksData.data) {
      // No bookmarks found, return empty arrays
      return { tweets: [], users: {} };
    }
    
    // Extract tweets
    const tweets = bookmarksData.data;
    
    // Extract users from includes
    const users: { [key: string]: XUser } = {};
    if (bookmarksData.includes && bookmarksData.includes.users) {
      bookmarksData.includes.users.forEach((user: XUser) => {
        users[user.id] = user;
      });
    }
    
    // Extract next pagination token if available
    const nextToken = bookmarksData.meta && bookmarksData.meta.next_token;
    
    return { tweets, users, nextToken };
  }

  /**
   * Convert an X tweet to a bookmark
   */
  convertTweetToBookmark(tweet: XTweet, author?: XUser): InsertBookmark {
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
      tweet.entities.urls.forEach(url => {
        if (url.media_key) {
          mediaUrls.push(url.expanded_url);
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
      quote_count: tweet.public_metrics?.quote_count || 0,
      media_urls: mediaUrls,
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
    // Fetch X.com credentials for the user
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    // Track statistics
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    // Get all bookmarks from X.com
    let allBookmarks: { tweets: XTweet[], users: { [key: string]: XUser } } = { tweets: [], users: {} };
    let nextToken: string | undefined = undefined;
    
    do {
      try {
        const result = await this.getBookmarks(credentials.access_token, credentials.x_user_id, nextToken);
        allBookmarks.tweets = [...allBookmarks.tweets, ...result.tweets];
        allBookmarks.users = { ...allBookmarks.users, ...result.users };
        nextToken = result.nextToken;
      } catch (error) {
        console.error('Error fetching bookmarks from X.com:', error);
        errors++;
        break;
      }
    } while (nextToken);
    
    // Process each bookmark
    for (const tweet of allBookmarks.tweets) {
      try {
        const author = tweet.author_id ? allBookmarks.users[tweet.author_id] : undefined;
        const bookmarkData = this.convertTweetToBookmark(tweet, author);
        bookmarkData.user_id = userId;
        
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
   * Generate a fixed code verifier for PKCE
   * Using a static key provided for consistency
   */
  private generateCodeVerifier(): string {
    return "Y7$gVm29#pKfLq*1dC!xZehWTJr@u38oRnXs^BQa6E4NtiUw0+vYMkb9sjGl5HD%";
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