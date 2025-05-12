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
import { aiProcessorService } from './ai-processor-service';
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
  // Flag to mark tweets that only have IDs and need full data fetching
  needsFetching?: boolean;
}

/**
 * Interface for X.com Media data
 * Represents media attachments to tweets (images, videos, etc.)
 */
interface XMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
  variants?: Array<{
    bit_rate?: number;
    content_type: string;
    url: string;
  }>;
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
            "height",
            "variants"
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
      
      // The folder-specific endpoint is extremely restrictive on parameters
      // According to the API error response, it only accepts 'id' and 'folder_id'
      // The folder_id is already in the URL path, and we don't need an ID parameter
      // So we only need to add the pagination token if it exists
      
      const params = new URLSearchParams();
      
      // Add pagination token if provided
      if (paginationToken) {
        params.append("pagination_token", paginationToken);
      }
      
      // DO NOT add max_results, it's not supported by this endpoint
      // The API returned a 400 error when we tried to use it
      
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
      
      const data = await response.json() as any;
      
      // Log the full API response structure to help debug pagination
      console.log(`X Folders: Folder API full response structure:`, {
        hasData: !!data.data,
        dataLength: data.data ? data.data.length : 0,
        hasIncludes: !!data.includes,
        includesKeys: data.includes ? Object.keys(data.includes) : [],
        hasMeta: !!data.meta,
        metaKeys: data.meta ? Object.keys(data.meta) : [],
        metaContent: data.meta ? data.meta : {},
        hasErrors: !!data.errors,
        errors: data.errors,
        responseKeys: Object.keys(data)
      });
      
      console.log(`X Folders: Folder API response sample:`, JSON.stringify(data, null, 2).substring(0, 500));
      
      // Add detailed logging of the full data structure
      console.log(`X Folders: Inspecting data.data first item type:`, typeof data.data[0]);
      if (data.data && data.data.length > 0) {
        console.log(`X Folders: First item sample:`, JSON.stringify(data.data[0], null, 2));
        // Check if data items are objects or strings
        const hasObjects = data.data.some((item: any) => typeof item === 'object');
        const hasStrings = data.data.some((item: any) => typeof item === 'string');
        console.log(`X Folders: Data items include objects: ${hasObjects}, strings: ${hasStrings}`);
      }
      
      // The folder-specific endpoint returns data in a different format
      // It might just return tweet IDs rather than full tweet objects with metadata
      
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        console.log(`X Folders: No bookmarks found in folder ${folderId} or unexpected response format`);
        return { tweets: [], users: {}, media: {} };
      }
      
      // Since we need to get the actual tweets from these IDs, we need to call the main bookmarks API
      // with each tweet ID to get full details
      
      // Convert API response to our internal format
      // The folder API endpoint typically only returns tweet IDs or partial data
      // Always mark the tweets as needsFetching to ensure we get the full data
      const tweets = data.data.map((item: any) => {
        // If the item is just an ID string
        if (typeof item === 'string') {
          return {
            id: item,
            text: '', // Empty text - will be filled later when fetched
            needsFetching: true, // Mark that this tweet needs its full content fetched
            // No longer initializing local media
          };
        }
        
        // Even if we get a tweet object, we'll still mark it for fetching
        // The folder API doesn't consistently return complete data
        console.log(`X Folders: Adding ID for tweet ${item.id} to fetch queue`);
        
        // Return a tweet object, always marking it for fetching
        return {
          id: item.id,
          text: '', // Will be filled with actual content after fetching
          needsFetching: true, // Always fetch the full tweet data
          // No longer initializing local media
        };
      });
      
      // Extract users from includes (if available)
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
      
      // Extract media from includes (if available)
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
      
      // Log detailed information about the pagination
      console.log(`X Folders: Pagination info:`, {
        tweetCount: tweets.length,
        hasMeta: !!data.meta,
        metaFields: data.meta ? Object.keys(data.meta) : [],
        hasNextToken: !!nextToken,
        nextToken: nextToken || 'none'
      });
      
      console.log(`X Folders: Found ${tweets.length} bookmarks in folder ${folderId}`);
      return { tweets, users, nextToken, media };
    } catch (error) {
      console.error(`X Folders: Error fetching bookmarks from folder ${folderId}:`, error);
      throw error;
    }
  }

  /**
   * Convert an X tweet to a bookmark
   * This method processes tweet data and extracts media URLs without downloading them
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
    
    // Then add URLs from media attachments if available (without downloading)
    if (tweet.attachments && tweet.attachments.media_keys && mediaMap) {
      // Process all media items
      tweet.attachments.media_keys.forEach((mediaKey) => {
        const mediaItem = mediaMap[mediaKey];
        
        if (mediaItem) {
          // Handle media based on its type
          if (mediaItem.type === 'photo' && (mediaItem.url || mediaItem.preview_image_url)) {
            // For photos, use the direct URL if available, otherwise use preview image
            const mediaUrl = mediaItem.url || mediaItem.preview_image_url;
            if (mediaUrl) {
              mediaUrls.push(mediaUrl);
              console.log(`X Sync: Added photo media URL ${mediaUrl} for tweet ${tweet.id}`);
            }
          } 
          else if ((mediaItem.type === 'video' || mediaItem.type === 'animated_gif') && mediaItem.variants?.length) {
            // For videos and animated GIFs, get the direct video URL from variants
            // Find the highest quality video URL (highest bit rate)
            const videoVariants = mediaItem.variants
              .filter(variant => variant.content_type === 'video/mp4')
              .sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
            
            if (videoVariants.length > 0) {
              const videoUrl = videoVariants[0].url;
              mediaUrls.push(videoUrl);
              console.log(`X Sync: Added ${mediaItem.type} URL ${videoUrl} for tweet ${tweet.id}`);
              
              // Also add the preview image if available for fallback
              if (mediaItem.preview_image_url) {
                mediaUrls.push(mediaItem.preview_image_url);
                console.log(`X Sync: Added preview image URL ${mediaItem.preview_image_url} for ${mediaItem.type}`);
              }
            } else if (mediaItem.preview_image_url) {
              // If no video variants found, at least use the preview image
              mediaUrls.push(mediaItem.preview_image_url);
              console.log(`X Sync: Added preview image URL ${mediaItem.preview_image_url} as fallback for ${mediaItem.type}`);
            }
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
      // Store the original tweet creation date when available
      created_at: tweet.created_at ? new Date(tweet.created_at) : undefined,
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
  
  // The downloadAndStoreMedia method has been removed as per requirements
  // We now use the original media URLs directly from X/Twitter

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
   * Only syncs main bookmarks, not folder bookmarks (those are synced separately via the folder-specific sync)
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
      // The folderTweetMap will always be empty in this method to avoid folder sync
      // Folder sync is handled separately by syncBookmarksFromSpecificFolder
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
      
      // Skip folder sync during main bookmark sync to avoid rate limits
      console.log(`X Sync: Skipping folder sync during main bookmark sync to avoid rate limits`);
      console.log(`X Sync: Users can sync individual folders using the folder-specific sync buttons`);
      console.log(`X Sync: Continuing with main bookmarks sync`);
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
          
          // Specifically check for created_at and backfill it if the tweet has this data
          if (tweet.created_at) {
            // If existing bookmark has no created_at (null) or it's undefined
            if (!existingBookmark.created_at) {
              console.log(`X Sync: Backfilling created_at date for tweet ${tweet.id}`);
              updateData.created_at = new Date(tweet.created_at);
            }
          }
          
          // Update only the engagement metrics for the existing bookmark
          await storage.updateBookmark(existingBookmark.id, updateData);
          updated++;
        } else {
          // This is a new bookmark - create it with all data
          console.log(`X Sync: Creating new bookmark for tweet ${tweet.id}`);
          
          // Convert tweet to full bookmark (now async to handle media downloads)
          const bookmarkData = await this.convertTweetToBookmark(tweet, author, allBookmarks.media);
          bookmarkData.user_id = userId;
          
          // No longer downloading media files
          console.log(`X Sync: Using original media URLs for tweet ${tweet.id}`);
          
          // Create the new bookmark
          const newBookmark = await storage.createBookmark(bookmarkData);
          added++;
          
          // Skip folder processing during main bookmark sync
          // Note: In the regular syncBookmarks method, we don't process folder mappings
          // This is only done in syncBookmarksFromSpecificFolder
          console.log(`X Sync: Skipping folder mapping check for tweet ${tweet.id} during main sync`);
          // The folderTweetMap will always be empty here, so there's no need to process it
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
    
    // Trigger AI processing for newly added bookmarks
    if (added > 0) {
      console.log(`X Sync: Triggering AI processing for user ${userId} after sync (${added} new bookmarks)`);
      
      // We'll trigger the processing asynchronously but not wait for it to complete
      // This allows the sync API to return quickly while processing happens in the background
      aiProcessorService.processAfterSync(userId).catch(err => {
        console.error(`X Sync: Error triggering AI processing after sync: ${err}`);
      });
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
    let retryCount = 0;
    const maxRetries = 3;
    const baseDelay = 2000; // 2 second base delay between requests
    
    try {
      // Fetch bookmarks from this folder with pagination
      do {
        try {
          // Add a delay before each request to avoid rate limits
          // Exponential backoff if we've had to retry
          const delay = baseDelay * Math.pow(1.5, retryCount);
          console.log(`X Sync: Waiting ${delay}ms before fetching bookmarks from folder ${folder.id}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          console.log(`X Sync: Fetching bookmarks from folder ${folder.id}${nextToken ? ' with pagination token' : ''}`);
          const result = await this.getBookmarksFromFolder(userId, folder.id, nextToken);
          console.log(`X Sync: Fetched ${result.tweets.length} tweets from folder ${folder.id}`);
          
          // Reset retry count on successful request
          retryCount = 0;
          
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
        } catch (error: any) {
          console.error(`X Sync: Error fetching bookmarks from folder ${folder.id}:`, error);
          
          // Check if it's a rate limit error (429)
          if (error.message && error.message.includes('429')) {
            retryCount++;
            
            if (retryCount <= maxRetries) {
              console.log(`X Sync: Rate limit hit, retry attempt ${retryCount}/${maxRetries} after delay`);
              
              // Larger delay for rate limit errors
              const rateLimitDelay = baseDelay * Math.pow(3, retryCount); // Exponential backoff
              console.log(`X Sync: Waiting ${rateLimitDelay}ms before retrying...`);
              await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
              
              // Continue the loop without advancing to the next page
              continue;
            } else {
              console.log(`X Sync: Maximum retry attempts (${maxRetries}) reached for rate limit, stopping pagination`);
              break;
            }
          } else {
            // For other errors, stop pagination
            break;
          }
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
    console.log(`X Mapping: Mapping folder "${folderData.name}" (${folderData.id}) to collection ${collectionId}`);
    
    // First, check if this folder already exists in our system
    const [existingFolder] = await db.select()
      .from(xFolders)
      .where(
        and(
          eq(xFolders.user_id, userId),
          eq(xFolders.x_folder_id, folderData.id)
        )
      );
    
    if (existingFolder) {
      // Update the existing folder mapping to point to the new collection
      console.log(`X Mapping: Updating existing folder mapping from collection ${existingFolder.collection_id || 'none'} to ${collectionId}`);
      
      const [updatedFolder] = await db.update(xFolders)
        .set({
          x_folder_name: folderData.name, // Update name in case it changed
          collection_id: collectionId,
          updated_at: new Date()
        })
        .where(eq(xFolders.id, existingFolder.id))
        .returning();
      
      return updatedFolder;
    } else {
      // Create a new folder mapping
      console.log(`X Mapping: Creating new folder mapping for "${folderData.name}" to collection ${collectionId}`);
      
      const folderMapping: InsertXFolder = {
        user_id: userId,
        x_folder_id: folderData.id,
        x_folder_name: folderData.name,
        collection_id: collectionId,
      };
      
      // Store in database
      return await this.createFolderMapping(folderMapping);
    }
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
   * Sync bookmarks from a specific X.com folder
   * This is exposed to API consumers for manual folder syncing
   */
  async syncBookmarksFromSpecificFolder(userId: string, folderId: string): Promise<{ added: number, updated: number, errors: number, associated: number, fetched: number }> {
    console.log(`X Sync: Starting folder-specific sync for user ${userId}, folder ${folderId}`);
    
    let added = 0;
    let updated = 0;
    let errors = 0;
    let associated = 0; // Count of existing bookmarks associated with collections
    let fetched = 0; // Count of tweets that were fetched using the API
    
    try {
      // First, validate that the folder exists for this user
      const [folderData] = await db.select()
        .from(xFolders)
        .where(
          and(
            eq(xFolders.user_id, userId),
            eq(xFolders.x_folder_id, folderId)
          )
        );
      
      if (!folderData) {
        console.error(`X Sync: Folder ${folderId} not found for user ${userId}`);
        throw new Error(`Folder not found`);
      }
      
      console.log(`X Sync: Found folder "${folderData.x_folder_name}" (${folderId}) for user ${userId}`);
      
      // Check if this folder has a collection mapping
      if (!folderData.collection_id) {
        console.log(`X Sync: Warning - Folder "${folderData.x_folder_name}" has no collection mapping yet`);
        // We'll continue with the sync, but we won't be able to associate bookmarks with collections
      }
      
      // Create a wrapper that matches our standard bookmark collection format
      let folderBookmarks: { 
        tweets: XTweet[], 
        users: { [key: string]: XUser },
        media: { [key: string]: XMedia },
        folderTweetMap: Map<string, Set<string>>
      } = { 
        tweets: [], 
        users: {},
        media: {},
        folderTweetMap: new Map<string, Set<string>>()
      };
      
      // Create a cache to hold existing bookmark metadata for more efficient updates
      const existingBookmarkCache = await this.getExistingXBookmarks(userId);
      
      // Fetch bookmarks for this specific folder
      const folder: XFolderData = {
        id: folderData.x_folder_id,
        name: folderData.x_folder_name
      };
      
      // Use our existing folder sync function to get all the bookmarks
      await this.syncBookmarksFromFolder(userId, folder, folderBookmarks, existingBookmarkCache);
      
      console.log(`X Sync: Fetched ${folderBookmarks.tweets.length} tweets from folder ${folderId}`);
      
      // Log how many tweets we found in this folder
      console.log(`X Sync: Processing ${folderBookmarks.tweets.length} tweets from folder ${folderId}`);
      
      // We'll only fetch data for tweets we don't already have to conserve API quota
      const tweetIdsToFetch: string[] = [];
      const tweetIdsToSkipFetching: string[] = [];
      
      // Collect tweet IDs for fetching, but only for those we don't already have
      for (const tweet of folderBookmarks.tweets) {
        if (existingBookmarkCache.has(tweet.id)) {
          // We already have this tweet, so we can skip fetching it from the API
          // We'll just update its engagement metrics later using our existing data
          tweetIdsToSkipFetching.push(tweet.id);
          console.log(`X Sync: Skipping API fetch for tweet ${tweet.id} (already in database)`);
        } else {
          // We don't have this tweet yet, so add it to the fetch queue
          tweetIdsToFetch.push(tweet.id);
          console.log(`X Sync: Adding new tweet ${tweet.id} to fetch queue`);
        }
      }
      
      // Make a copy of tweets that we won't fetch (we'll need these later)
      const tweetsToSkip = folderBookmarks.tweets.filter(t => tweetIdsToSkipFetching.includes(t.id));
      
      // Clear the tweets array, we'll refill it after processing
      folderBookmarks.tweets = [];
      
      console.log(`X Sync: Will fetch ${tweetIdsToFetch.length} new tweets from X API and skip ${tweetIdsToSkipFetching.length} existing tweets`);
      
      // If we have new tweets to fetch, process them in batches
      if (tweetIdsToFetch.length > 0) {
        // X API allows up to 100 IDs per request, so we'll batch them
        const batchSize = 100;
        const batches: string[][] = [];
        
        for (let i = 0; i < tweetIdsToFetch.length; i += batchSize) {
          batches.push(tweetIdsToFetch.slice(i, i + batchSize));
        }
        
        console.log(`X Sync: Splitting ${tweetIdsToFetch.length} tweets into ${batches.length} batches of up to ${batchSize} each`);
        
        // Process each batch
        for (const batch of batches) {
          try {
            // Fetch the full tweet data
            const batchData = await this.fetchTweetsBatch(userId, batch);
            
            // If we got results, add them to our collection
            if (batchData.tweets.length > 0) {
              console.log(`X Sync: Successfully fetched ${batchData.tweets.length}/${batch.length} tweets from X API`);
              fetched += batchData.tweets.length;
              
              // Add these tweets to our collection
              folderBookmarks.tweets.push(...batchData.tweets);
              
              // Add users and media to our collection
              Object.assign(folderBookmarks.users, batchData.users);
              Object.assign(folderBookmarks.media, batchData.media);
            } else {
              console.log(`X Sync: No tweets returned from X API for this batch`);
            }
          } catch (batchError) {
            console.error(`X Sync: Error fetching batch of tweets:`, batchError);
            errors++;
          }
        }
      }
      
      // Add back the tweets we skipped fetching
      if (tweetsToSkip && tweetsToSkip.length > 0) {
        console.log(`X Sync: Adding back ${tweetsToSkip.length} existing tweets that we skipped fetching`);
        folderBookmarks.tweets.push(...tweetsToSkip);
      }
      
      // Process each bookmark 
      const processedTweetIds = new Set<string>();
      
      for (const tweet of folderBookmarks.tweets) {
        try {
          // Skip if we've already processed this tweet
          if (processedTweetIds.has(tweet.id)) {
            continue;
          }
          
          processedTweetIds.add(tweet.id);
          
          // Check if bookmark already exists in our cache
          const existingBookmark = existingBookmarkCache.get(tweet.id);
          
          if (existingBookmark) {
            // The bookmark already exists in our system
            const author = tweet.author_id ? folderBookmarks.users[tweet.author_id] : undefined;
            
            // Update engagement metrics if we have them
            if (tweet.public_metrics) {
              console.log(`X Sync: Updating engagement metrics for existing bookmark (tweet ${tweet.id})`);
              
              // Extract just the engagement metrics and add created_at if missing
              const updateData: Partial<InsertBookmark> = {
                like_count: tweet.public_metrics?.like_count,
                repost_count: tweet.public_metrics?.retweet_count,
                reply_count: tweet.public_metrics?.reply_count,
                quote_count: tweet.public_metrics?.quote_count
              };
              
              // Specifically check for created_at and backfill it if the tweet has this data
              if (tweet.created_at) {
                // If existing bookmark has no created_at (null) or it's undefined
                if (!existingBookmark.created_at) {
                  console.log(`X Sync: Backfilling created_at date for tweet ${tweet.id}`);
                  updateData.created_at = new Date(tweet.created_at);
                }
              }
              
              // Update only the engagement metrics for the existing bookmark
              await storage.updateBookmark(existingBookmark.id, updateData);
              updated++;
            }
            
            // If this folder has a collection mapping, associate the bookmark with it
            if (folderData.collection_id) {
              try {
                console.log(`X Sync: Associating existing bookmark ${existingBookmark.id} with collection ${folderData.collection_id}`);
                
                // Add the bookmark to the mapped collection if it's not already there
                await storage.addBookmarkToCollection(folderData.collection_id, existingBookmark.id);
                associated++;
              } catch (collectionError) {
                // This is likely because the bookmark is already in the collection, which is fine
                console.log(`X Sync: Note - Bookmark ${existingBookmark.id} might already be in collection ${folderData.collection_id}`);
              }
            }
          } else {
            // We don't have this bookmark yet, create it with the fetched data
            try {
              const author = tweet.author_id ? folderBookmarks.users[tweet.author_id] : undefined;
              
              console.log(`X Sync: Creating new bookmark for tweet ${tweet.id}`);
              
              // Convert tweet to full bookmark
              const bookmarkData = await this.convertTweetToBookmark(tweet, author, folderBookmarks.media);
              bookmarkData.user_id = userId;
              
              // Create the new bookmark
              const newBookmark = await storage.createBookmark(bookmarkData);
              added++;
              
              // If this folder has a collection mapping, associate the bookmark with it
              if (folderData.collection_id) {
                console.log(`X Sync: Adding new bookmark ${newBookmark.id} to collection ${folderData.collection_id}`);
                
                // Add the bookmark to the mapped collection
                await storage.addBookmarkToCollection(folderData.collection_id, newBookmark.id);
                associated++;
              }
            } catch (createError) {
              console.error(`X Sync: Error creating bookmark for tweet ${tweet.id}:`, createError);
              errors++;
            }
          }
        } catch (error) {
          console.error(`X Sync: Error processing tweet ${tweet.id}:`, error);
          errors++;
        }
      }
      
      // Update last sync time for the folder
      await storage.updateXFolderLastSync(folderData.id);
      
      // Trigger AI processing for newly added bookmarks
      if (added > 0) {
        console.log(`X Sync: Triggering AI processing for user ${userId} after folder sync (${added} new bookmarks)`);
        
        // We'll trigger the processing asynchronously but not wait for it to complete
        // This allows the sync API to return quickly while processing happens in the background
        aiProcessorService.processAfterSync(userId).catch(err => {
          console.error(`X Sync: Error triggering AI processing after folder sync: ${err}`);
        });
      }
      
      console.log(`X Sync: Finished folder sync - Added: ${added}, Updated: ${updated}, Fetched: ${fetched}, Associated with collections: ${associated}, Errors: ${errors}`);
      return { added, updated, errors, associated, fetched };
      
    } catch (error) {
      console.error(`X Sync: Error syncing folder ${folderId}:`, error);
      throw error;
    }
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
   * Fetch tweet data for a batch of tweet IDs
   * This uses the /2/tweets endpoint to get full tweet data for IDs we only have references to
   */
  private async fetchTweetsBatch(userId: string, tweetIds: string[]): Promise<{
    tweets: XTweet[],
    users: { [key: string]: XUser },
    media: { [key: string]: XMedia }
  }> {
    if (tweetIds.length === 0) {
      return { tweets: [], users: {}, media: {} };
    }
    
    console.log(`X Batch Fetch: Fetching data for ${tweetIds.length} tweets`);
    
    // Get user credentials
    const credentials = await this.getUserCredentials(userId);
    
    if (!credentials) {
      throw new Error('User is not authenticated with X.com');
    }
    
    try {
      // Create the authenticated URL for the tweets lookup endpoint
      const url = new URL(`${X_API_BASE}/2/tweets`);
      
      // Add the tweet IDs as a comma-separated list
      const params = new URLSearchParams();
      params.append("ids", tweetIds.join(','));
      
      // Add expansions and fields to get complete tweet data
      params.append("expansions", "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id");
      params.append("tweet.fields", "created_at,public_metrics,entities,attachments");
      params.append("user.fields", "name,username,profile_image_url");
      params.append("media.fields", "url,preview_image_url,alt_text,type,width,height,variants");
      
      url.search = params.toString();
      
      // Make the API request with the user's access token
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X Batch Fetch: Error fetching tweets, Status: ${response.status}, Response:`, errorText);
        
        // Check if this is an auth error
        if (response.status === 401) {
          throw new Error('User needs to reconnect');
        }
        
        throw new Error(`Failed to get tweets data: ${response.status} ${errorText}`);
      }
      
      const data = await response.json() as any;
      
      // Log a response sample for debugging
      console.log(`X Batch Fetch: Response sample:`, JSON.stringify(data, null, 2).substring(0, 300) + '...');
      
      if (!data || !data.data || !Array.isArray(data.data)) {
        console.log(`X Batch Fetch: No tweets found or unexpected response format`);
        return { tweets: [], users: {}, media: {} };
      }
      
      // Convert API response to our internal format
      const tweets = data.data.map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text || '',
        created_at: tweet.created_at,
        author_id: tweet.author_id,
        public_metrics: tweet.public_metrics,
        entities: tweet.entities,
        attachments: tweet.attachments
        // No longer initializing local media
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
      
      console.log(`X Batch Fetch: Successfully fetched ${tweets.length} tweets, ${Object.keys(users).length} users, and ${Object.keys(media).length} media items`);
      return { tweets, users, media };
      
    } catch (error) {
      console.error(`X Batch Fetch: Error fetching tweet data:`, error);
      throw error;
    }
  }
  
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