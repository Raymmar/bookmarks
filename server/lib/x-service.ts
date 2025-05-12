/**
 * X.com Integration Service
 *
 * Manages integration with X.com (formerly Twitter) API, including:
 * - User authentication
 * - Bookmark synchronization
 * - Tweet content processing
 */

import fetch from "node-fetch";
import { v4 as uuid } from "uuid";
import { storage, IStorage } from "../storage";
import { BookmarkService } from "./bookmark-service";
import { AiProcessorService } from "./ai-processor-service";
import { db } from "../db";
import { bookmarks, xCredentials } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

// X.com API constants
const X_CLIENT_ID = process.env.X_CLIENT_ID || "";
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "";
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || "";

// API endpoints
const AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const BOOKMARKS_URL = "https://api.twitter.com/2/users/:user_id/bookmarks";
const USERS_ME_URL = "https://api.twitter.com/2/users/me";
const TWEET_LOOKUP_URL = "https://api.twitter.com/2/tweets";

// Service instances
const bookmarkService = new BookmarkService();
const aiProcessorService = new AiProcessorService();

export class XService {
  constructor(private storage: IStorage = storage) {}

  /**
   * Generate authorization URL for X.com OAuth flow
   */
  async getAuthorizationUrl(userId: string): Promise<{ url: string; verifier: string }> {
    // Generate a code verifier
    const verifier = this.generateRandomString(64);
    const challenge = await this.generateCodeChallenge(verifier);
    
    // Generate state parameter with user ID
    const state = userId;
    
    // Store the verifier and state temporarily
    await this.storage.setXAuthState(userId, { verifier, state });
    
    // Construct the authorization URL
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("client_id", X_CLIENT_ID);
    authUrl.searchParams.append("redirect_uri", X_REDIRECT_URI);
    authUrl.searchParams.append("scope", "users.read tweet.read bookmarks.read offline.access");
    authUrl.searchParams.append("state", state);
    authUrl.searchParams.append("code_challenge", challenge);
    authUrl.searchParams.append("code_challenge_method", "S256");
    
    return {
      url: authUrl.toString(),
      verifier: verifier
    };
  }

  /**
   * Handle OAuth callback from X.com
   */
  async handleCallback(code: string, state: string, verifier: string): Promise<boolean> {
    try {
      // Verify state parameter matches the user ID
      const userId = state;
      if (!userId) {
        console.error("X Callback: Invalid state parameter");
        return false;
      }
      
      // Exchange code for tokens
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: X_CLIENT_ID,
          client_secret: X_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: X_REDIRECT_URI,
          code_verifier: verifier,
        }),
      });
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error("X Callback: Token request failed:", error);
        return false;
      }
      
      const tokenData = await tokenResponse.json() as any;
      
      // Get user info from X.com API
      const userResponse = await fetch(USERS_ME_URL, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      
      if (!userResponse.ok) {
        console.error("X Callback: Failed to fetch user info");
        return false;
      }
      
      const userData = await userResponse.json() as any;
      const xUserId = userData.data.id;
      const xUsername = userData.data.username;
      
      // Calculate token expiration
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
      
      // Store credentials
      await this.storage.saveXCredentials({
        id: uuid(),
        user_id: userId,
        x_user_id: xUserId,
        x_username: xUsername,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt,
        created_at: new Date(),
        last_synced: null,
      });
      
      // Clear temporary state
      await this.storage.clearXAuthState(userId);
      
      return true;
    } catch (error) {
      console.error("X Callback: Error processing callback:", error);
      return false;
    }
  }

  /**
   * Refresh the X.com access token
   */
  async refreshAccessToken(refreshToken: string) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: X_CLIENT_ID,
        client_secret: X_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("X Token Refresh: Failed to refresh token:", errorText);
      throw new Error("Failed to refresh token");
    }
    
    const data = await response.json() as any;
    
    // Calculate new expiration time
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + data.expires_in);
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Some providers don't return a new refresh token
      token_expires_at: expiresAt,
    };
  }

  /**
   * Get user credentials for X.com
   */
  async getUserCredentials(userId: string) {
    return this.storage.getXCredentials(userId);
  }

  /**
   * Delete user credentials for X.com
   */
  async deleteUserCredentials(userId: string): Promise<boolean> {
    try {
      const credentials = await this.storage.getXCredentials(userId);
      if (!credentials) {
        return true; // Already deleted or never existed
      }
      
      await this.storage.deleteXCredentials(userId);
      return true;
    } catch (error) {
      console.error(`X: Error deleting credentials for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Sync bookmarks from X.com
   */
  async syncBookmarks(userId: string) {
    console.log(`X Sync: Starting sync for user ${userId}`);
    
    // Counters for tracking sync results
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    try {
      // Get user credentials
      const credentials = await this.storage.getXCredentials(userId);
      
      if (!credentials) {
        console.error(`X Sync: User ${userId} is not connected to X.com`);
        throw new Error("User is not connected to X.com");
      }
      
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
          await this.storage.updateXCredentials(credentials.id, refreshedCreds);
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
      
      // Get latest credentials after possible refresh
      const updatedCredentials = await this.storage.getXCredentials(userId);
      if (!updatedCredentials) {
        throw new Error("User credentials not found");
      }
      
      // Initialize collection for all bookmarks
      const allBookmarks: any[] = [];
      
      // Sync all bookmarks from X.com
      let paginationToken = undefined;
      let totalFetched = 0;
      let hasMorePages = true;
      
      // Sync bookmarks page by page until we have all or hit limits
      while (hasMorePages && totalFetched < 500) {
        try {
          const result = await this.fetchBookmarksPage(
            updatedCredentials.x_user_id,
            updatedCredentials.access_token,
            paginationToken
          );
          
          if (result.bookmarks && result.bookmarks.length > 0) {
            allBookmarks.push(...result.bookmarks);
            totalFetched += result.bookmarks.length;
          }
          
          paginationToken = result.next_token;
          hasMorePages = !!paginationToken;
          
          // Break if no more pages or reached end
          if (!hasMorePages) {
            console.log(`X Sync: Reached end of bookmarks at ${totalFetched}`);
            break;
          }
          
          // Add a small delay between pages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (pageError) {
          console.error(`X Sync: Error fetching bookmarks page:`, pageError);
          errors++;
          break;
        }
      }
      
      console.log(`X Sync: Fetched ${allBookmarks.length} bookmarks from X.com`);
      
      // Update last_synced timestamp
      await this.storage.updateXSyncTimestamp(updatedCredentials.id);
      
      // Process all bookmarks
      const results = await this.processXBookmarks(userId, allBookmarks, existingXBookmarks);
      added = results.added;
      updated = results.updated;
      errors += results.errors;
    } catch (error) {
      console.error(`X Sync: Error syncing bookmarks:`, error);
      errors++;
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
   * Process X bookmarks in a transaction to avoid race conditions
   */
  private async processXBookmarks(userId: string, xBookmarks: any[], existingBookmarks: Map<string, string>) {
    let added = 0;
    let updated = 0;
    let errors = 0;
    
    // Process bookmarks in batches to avoid long transactions
    const batchSize = 10;
    
    for (let i = 0; i < xBookmarks.length; i += batchSize) {
      const batch = xBookmarks.slice(i, i + batchSize);
      
      try {
        // Start a transaction to ensure atomicity
        await db.transaction(async (tx) => {
          for (const bookmark of batch) {
            try {
              const externalId = bookmark.id;
              
              // Check if this bookmark already exists in our tracking Map
              const existingId = existingBookmarks.get(externalId);
              
              if (existingId) {
                // Bookmark already exists, update if needed
                console.log(`X Sync: Bookmark ${externalId} already exists, updating if needed`);
                // Check if we need to update (you could add update logic here)
                updated++;
              } else {
                // Create new bookmark with transaction
                const result = await this.createXBookmark(tx, userId, bookmark);
                
                if (result.success) {
                  added++;
                  // Add to our existing bookmarks map to avoid duplicates in same batch
                  existingBookmarks.set(externalId, result.bookmarkId);
                } else {
                  errors++;
                }
              }
            } catch (bookmarkError) {
              console.error(`X Sync: Error processing bookmark:`, bookmarkError);
              errors++;
            }
          }
        });
      } catch (batchError) {
        console.error(`X Sync: Error processing bookmark batch:`, batchError);
        errors += batch.length;
      }
    }
    
    return { added, updated, errors };
  }

  /**
   * Create a bookmark from X.com data within a transaction
   */
  private async createXBookmark(tx: any, userId: string, tweet: any) {
    try {
      // Build the bookmark data
      const tweetUrl = `https://x.com/user/status/${tweet.id}`;
      const normalizedUrl = tweetUrl; // URL service may normalize differently
      
      // Check if bookmark already exists for this user+tweet to avoid duplicates
      const existingBookmark = await tx.select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.user_id, userId),
            eq(bookmarks.external_id, tweet.id),
            eq(bookmarks.source, 'x')
          )
        )
        .limit(1);
      
      if (existingBookmark.length > 0) {
        return {
          success: true,
          bookmarkId: existingBookmark[0].id,
          isNew: false
        };
      }
      
      // Extract meta from tweet
      const tweetText = tweet.text;
      const tweetAuthor = tweet.author ? tweet.author.username : 'unknown';
      const mediaUrls = tweet.media ? tweet.media.map((m: any) => m.url).filter((u: string) => u) : [];
      
      // Format title and description
      const title = `Tweet by @${tweetAuthor}`;
      const description = tweetText.substring(0, 300);
      
      // Create the bookmark
      const newBookmark = {
        id: uuid(),
        user_id: userId,
        url: tweetUrl,
        normalized_url: normalizedUrl,
        title: title,
        description: description,
        date_saved: new Date(),
        updated_at: new Date(),
        source: 'x',
        external_id: tweet.id,
        media_urls: mediaUrls,
        content_html: tweetText,
        reading_progress: 0,
        favorite: false,
        archived: false,
        read_later: true
      };
      
      // Insert using transaction
      await tx.insert(bookmarks).values(newBookmark);
      
      return {
        success: true,
        bookmarkId: newBookmark.id,
        isNew: true
      };
    } catch (error) {
      console.error(`X Sync: Error creating bookmark:`, error);
      return {
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Fetch a page of bookmarks from X.com API
   */
  private async fetchBookmarksPage(xUserId: string, accessToken: string, paginationToken?: string) {
    let url = BOOKMARKS_URL.replace(':user_id', xUserId);
    
    // Build query parameters
    const params = new URLSearchParams({
      "tweet.fields": "id,text,created_at,attachments,entities,public_metrics",
      "user.fields": "username,profile_image_url",
      "media.fields": "url,preview_image_url,type",
      "expansions": "author_id,attachments.media_keys",
      "max_results": "100" // Maximum allowed by the API
    });
    
    // Add pagination token if provided
    if (paginationToken) {
      params.append("pagination_token", paginationToken);
    }
    
    url = `${url}?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`X API: Error fetching bookmarks:`, error);
      throw new Error(`Failed to fetch bookmarks from X.com: ${error}`);
    }
    
    const data = await response.json();
    
    // Process the results to combine tweets with their authors and media
    const processedBookmarks = this.processBookmarksResponse(data);
    
    return {
      bookmarks: processedBookmarks,
      next_token: data.meta ? data.meta.next_token : undefined
    };
  }
  
  /**
   * Process the raw X.com bookmarks response into a more usable format
   */
  private processBookmarksResponse(data: any) {
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }
    
    // Create maps for users and media
    const users = new Map();
    const media = new Map();
    
    // Map all users by their id
    if (data.includes && data.includes.users) {
      data.includes.users.forEach((user: any) => {
        users.set(user.id, user);
      });
    }
    
    // Map all media by their media key
    if (data.includes && data.includes.media) {
      data.includes.media.forEach((item: any) => {
        media.set(item.media_key, item);
      });
    }
    
    // Process each tweet
    return data.data.map((tweet: any) => {
      // Find the author
      let author = null;
      if (tweet.author_id && users.has(tweet.author_id)) {
        author = users.get(tweet.author_id);
      }
      
      // Find media attachments
      let tweetMedia = [];
      if (tweet.attachments && tweet.attachments.media_keys) {
        tweetMedia = tweet.attachments.media_keys
          .map((key: string) => media.get(key))
          .filter((item: any) => item); // Remove undefined items
      }
      
      // Return the processed tweet
      return {
        ...tweet,
        author,
        media: tweetMedia
      };
    });
  }

  /**
   * Get all existing X bookmarks for a user
   * Returns a Map of external_id -> bookmark_id for quick lookup
   */
  private async getExistingXBookmarks(userId: string): Promise<Map<string, string>> {
    const results = await db.select({
      id: bookmarks.id,
      external_id: bookmarks.external_id
    })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.user_id, userId),
        eq(bookmarks.source, 'x')
      )
    );
    
    const bookmarkMap = new Map<string, string>();
    
    for (const bookmark of results) {
      if (bookmark.external_id) {
        bookmarkMap.set(bookmark.external_id, bookmark.id);
      }
    }
    
    return bookmarkMap;
  }

  // Utility methods
  
  /**
   * Generate a random string for OAuth flow
   */
  private generateRandomString(length: number): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
  
  /**
   * Generate code challenge for PKCE
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    
    // Hash with SHA-256
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    // Base64 encode
    const base64 = this.base64UrlEncode(new Uint8Array(hash));
    
    return base64;
  }
  
  /**
   * Base64 URL encode for PKCE
   */
  private base64UrlEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}

// Export a singleton instance
export const xService = new XService();