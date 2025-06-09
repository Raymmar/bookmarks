import { 
  bookmarks, Bookmark, InsertBookmark,
  notes, Note, InsertNote,
  screenshots, Screenshot, InsertScreenshot,
  highlights, Highlight, InsertHighlight,
  insights, Insight, InsertInsight,
  activities, Activity, InsertActivity,
  tags, Tag, InsertTag,
  bookmarkTags, BookmarkTag, InsertBookmarkTag,
  collectionTags, CollectionTag, InsertCollectionTag,
  chatSessions, ChatSession, InsertChatSession,
  chatMessages, ChatMessage, InsertChatMessage,
  settings, Setting, InsertSetting,
  users, User, InsertUser,
  collections, Collection, InsertCollection,
  collectionBookmarks, CollectionBookmark, InsertCollectionBookmark,
  reports, Report, InsertReport,
  reportBookmarks, ReportBookmark, InsertReportBookmark,
  xCredentials, XCredentials, InsertXCredentials,
  xFolders, XFolder, InsertXFolder
} from "@shared/schema";
import { Db } from "./db";
import { eq, desc, asc, sql, inArray, and, or, ilike } from "drizzle-orm";

// Storage interface
export interface Storage {
  // Database access
  getDb(): Db;
  
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Email verification
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  setVerificationToken(userId: string, token: string, expiresIn: number): Promise<boolean>;
  verifyEmail(token: string): Promise<User | undefined>;
  
  // Password reset
  getUserByResetToken(token: string): Promise<User | undefined>;
  setResetToken(userId: string, token: string, expiresIn: number): Promise<boolean>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;

  // Bookmarks
  getBookmarks(userId?: string, options?: { limit?: number; offset?: number; sort?: string; searchQuery?: string }): Promise<Bookmark[]>;
  getBookmarksCount(userId?: string, options?: { searchQuery?: string }): Promise<number>;
  getBookmark(id: string): Promise<Bookmark | undefined>;
  createBookmark(bookmark: InsertBookmark): Promise<Bookmark>;
  updateBookmark(id: string, bookmark: Partial<InsertBookmark>): Promise<Bookmark | undefined>;
  deleteBookmark(id: string): Promise<boolean>;
  
  // Collections
  getCollections(userId?: string): Promise<Collection[]>;
  getPublicCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | undefined>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<boolean>;
  
  // Collection Bookmarks
  getBookmarksByCollectionId(collectionId: string, options?: { limit?: number; offset?: number; sort?: string; searchQuery?: string }): Promise<Bookmark[]>;
  getBookmarksByCollectionIdCount(collectionId: string, options?: { searchQuery?: string }): Promise<number>;
  getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]>;
  addBookmarkToCollection(collectionId: string, bookmarkId: string): Promise<CollectionBookmark>;
  removeBookmarkFromCollection(collectionId: string, bookmarkId: string): Promise<boolean>;
  
  // Collection Tags
  getTagsByCollectionId(collectionId: string): Promise<Tag[]>;
  getCollectionsByTagId(tagId: string): Promise<Collection[]>;
  addTagToCollection(collectionId: string, tagId: string): Promise<CollectionTag>;
  removeTagFromCollection(collectionId: string, tagId: string): Promise<boolean>;
  processTaggedBookmarksForCollection(collectionId: string): Promise<number>;
  
  // Notes
  getNotesByBookmarkId(bookmarkId: string): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;
  deleteNote(id: string): Promise<boolean>;
  
  // Screenshots
  getScreenshotsByBookmarkId(bookmarkId: string): Promise<Screenshot[]>;
  createScreenshot(screenshot: InsertScreenshot): Promise<Screenshot>;
  deleteScreenshot(id: string): Promise<boolean>;
  
  // Highlights
  getHighlightsByBookmarkId(bookmarkId: string): Promise<Highlight[]>;
  createHighlight(highlight: InsertHighlight): Promise<Highlight>;
  deleteHighlight(id: string): Promise<boolean>;
  
  // Insights
  getInsightByBookmarkId(bookmarkId: string): Promise<Insight | undefined>;
  createInsight(insight: InsertInsight): Promise<Insight>;
  updateInsight(id: string, insight: Partial<InsertInsight>): Promise<Insight | undefined>;
  
  // Activities
  getActivities(userId?: string, options?: { limit?: number; offset?: number }): Promise<Activity[]>;
  getActivitiesCount(userId?: string): Promise<number>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  
  // Tags
  getTags(userId?: string): Promise<Tag[]>;
  getTag(id: string): Promise<Tag | undefined>;
  getTagByName(name: string): Promise<Tag | undefined>;
  createTag(tag: InsertTag): Promise<Tag>;
  updateTag(id: string, tag: Partial<InsertTag>): Promise<Tag | undefined>;
  incrementTagCount(id: string): Promise<Tag | undefined>;
  decrementTagCount(id: string): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<boolean>;
  
  // BookmarkTags
  getTagsByBookmarkId(bookmarkId: string): Promise<Tag[]>;
  getAllBookmarkTags(bookmarkIds?: string[]): Promise<{[bookmarkId: string]: Tag[]}>;
  getBookmarksByTagId(tagId: string): Promise<Bookmark[]>;
  addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag>;
  removeTagFromBookmark(bookmarkId: string, tagId: string): Promise<boolean>;
  
  // Chat Sessions
  getChatSessions(userId?: string): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  updateChatSession(id: string, session: Partial<InsertChatSession>): Promise<ChatSession | undefined>;
  deleteChatSession(id: string): Promise<boolean>;
  
  // Chat Messages
  getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  deleteChatMessagesBySessionId(sessionId: string): Promise<boolean>;
  
  // Settings
  getSettings(userId?: string): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  createSetting(setting: InsertSetting): Promise<Setting>;
  updateSetting(key: string, value: string): Promise<Setting | undefined>;
  deleteSetting(key: string): Promise<boolean>;
  
  // Reports
  getReportsByUserId(userId: string): Promise<Report[]>;
  getReport(id: string): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReport(id: string, reportUpdate: Partial<InsertReport>): Promise<Report | undefined>;
  updateReportStatus(id: string, status: "generating" | "completed" | "failed"): Promise<Report | undefined>;
  deleteReport(id: string): Promise<boolean>;
  
  // Report Bookmarks
  getReportBookmarks(reportId: string): Promise<ReportBookmark[]>;
  getBookmarksByReportId(reportId: string): Promise<Bookmark[]>;
  getBookmarksWithInsightsAndTags(userId: string, since: Date, limit?: number): Promise<{
    bookmark: Bookmark;
    insight?: Insight;
    tags: Tag[];
  }[]>;
  addBookmarkToReport(reportId: string, bookmarkId: string): Promise<ReportBookmark>;
  removeBookmarkFromReport(reportId: string, bookmarkId: string): Promise<boolean>;
  
  // X.com integration
  createXCredentials(credentials: InsertXCredentials): Promise<XCredentials>;
  getXCredentialsByUserId(userId: string): Promise<XCredentials | undefined>;
  updateXCredentials(id: string, credentials: Partial<XCredentials>): Promise<XCredentials | undefined>;
  createXFolder(folder: InsertXFolder): Promise<XFolder>;
  getXFoldersByUserId(userId: string): Promise<XFolder[]>;
  getStoredXFolders(userId: string): Promise<XFolder[]>;
  updateXFolder(id: string, folderUpdate: Partial<XFolder>): Promise<XFolder | undefined>;
  updateXFolderLastSync(id: string): Promise<XFolder | undefined>;
  findBookmarkByExternalId(userId: string, externalId: string, source: string): Promise<Bookmark | undefined>;
}

// PostgreSQL database storage implementation
export class DatabaseStorage implements Storage {
  constructor(private readonly db: Db) {}

  // Database access - provide raw access to the database for direct queries
  getDb(): Db {
    return this.db;
  }
  // Users
  async getUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await this.db
      .insert(users)
      .values(user)
      .returning();
    return newUser;
  }
  
  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await this.db
      .update(users)
      .set({ ...userUpdate, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }
  
  async deleteUser(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
  
  // Email verification methods
  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.verification_token, token));
    return user || undefined;
  }
  
  async setVerificationToken(userId: string, token: string, expiresIn: number): Promise<boolean> {
    // Calculate expiration date (current time + expiresIn in milliseconds)
    const expires = new Date(Date.now() + expiresIn);
    
    const [updatedUser] = await this.db
      .update(users)
      .set({ 
        verification_token: token, 
        verification_expires: expires,
        updated_at: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
      
    return !!updatedUser;
  }
  
  async verifyEmail(token: string): Promise<User | undefined> {
    console.log("Storage: verifyEmail called with token:", token);
    
    // Find user with this token
    const user = await this.getUserByVerificationToken(token);
    console.log("Storage: user found?", !!user);
    
    if (!user) {
      console.log("Storage: No user found with this token");
      return undefined;
    }
    
    console.log("Storage: Found user:", user.id, user.email, "email verified:", user.email_verified);
    
    // Check if token is expired
    if (user.verification_expires && new Date(user.verification_expires) < new Date()) {
      console.log("Storage: Token expired at:", user.verification_expires);
      return undefined;
    }
    
    console.log("Storage: Token is valid, proceeding to update user");
    
    // Verify the email by updating the user
    try {
      const [updatedUser] = await this.db
        .update(users)
        .set({ 
          email_verified: true,
          verification_token: null,
          verification_expires: null,
          updated_at: new Date()
        })
        .where(eq(users.id, user.id))
        .returning();
      
      console.log("Storage: User updated successfully:", !!updatedUser);
      return updatedUser || undefined;
    } catch (error) {
      console.error("Storage: Error updating user:", error);
      throw error;
    }
  }
  
  // Password reset methods
  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.reset_token, token));
    return user || undefined;
  }
  
  async setResetToken(userId: string, token: string, expiresIn: number): Promise<boolean> {
    // Calculate expiration date (current time + expiresIn in milliseconds)
    const expires = new Date(Date.now() + expiresIn);
    
    const [updatedUser] = await this.db
      .update(users)
      .set({ 
        reset_token: token, 
        reset_expires: expires,
        updated_at: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
      
    return !!updatedUser;
  }
  
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    // Find user with this token
    const user = await this.getUserByResetToken(token);
    if (!user) return false;
    
    // Check if token is expired
    if (user.reset_expires && new Date(user.reset_expires) < new Date()) {
      return false;
    }
    
    // Reset the password by updating the user
    const [updatedUser] = await this.db
      .update(users)
      .set({ 
        password: newPassword,
        reset_token: null,
        reset_expires: null,
        updated_at: new Date()
      })
      .where(eq(users.id, user.id))
      .returning();
      
    return !!updatedUser;
  }
  
  // Collections
  async getCollections(userId?: string): Promise<Collection[]> {
    if (userId) {
      return await this.db.select().from(collections).where(eq(collections.user_id, userId));
    }
    return await this.db.select().from(collections);
  }
  
  async getPublicCollections(): Promise<Collection[]> {
    return await this.db.select().from(collections).where(eq(collections.is_public, true));
  }
  
  async getCollection(id: string): Promise<Collection | undefined> {
    const [collection] = await this.db.select().from(collections).where(eq(collections.id, id));
    return collection || undefined;
  }
  
  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [newCollection] = await this.db
      .insert(collections)
      .values(collection)
      .returning();
    return newCollection;
  }
  
  async updateCollection(id: string, collectionUpdate: Partial<InsertCollection>): Promise<Collection | undefined> {
    const [updatedCollection] = await this.db
      .update(collections)
      .set({ ...collectionUpdate, updated_at: new Date() })
      .where(eq(collections.id, id))
      .returning();
    return updatedCollection || undefined;
  }
  
  async deleteCollection(id: string): Promise<boolean> {
    try {
      // First, remove any X.com folder mappings to this collection
      await this.db.update(xFolders)
        .set({ 
          collection_id: null,
          updated_at: new Date()
        })
        .where(eq(xFolders.collection_id, id));
      
      // Then remove bookmark-collection associations (but NOT the bookmarks themselves)
      // This just deletes the relationship records in collectionBookmarks table
      await this.db.delete(collectionBookmarks)
        .where(eq(collectionBookmarks.collection_id, id));
      
      // Finally delete the collection itself
      const result = await this.db.delete(collections)
        .where(eq(collections.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error(`Error deleting collection ${id}:`, error);
      throw error;
    }
  }
  
  // Collection Bookmarks
  async getBookmarksByCollectionId(collectionId: string, options?: { limit?: number; offset?: number; sort?: string; searchQuery?: string }): Promise<Bookmark[]> {
    if (!options?.searchQuery) {
      // If no search query, use the standard query without complex joins
      let query = this.db
        .select({
          bookmark: bookmarks
        })
        .from(collectionBookmarks)
        .innerJoin(bookmarks, eq(collectionBookmarks.bookmark_id, bookmarks.id))
        .where(eq(collectionBookmarks.collection_id, collectionId))
        .$dynamic();
      
      // Apply sorting
      if (options?.sort) {
        switch (options.sort) {
          case 'newest':
            query = query.orderBy(desc(bookmarks.date_saved));
            break;
          case 'oldest':
            query = query.orderBy(asc(bookmarks.date_saved));
            break;
          case 'recently_updated':
            query = query.orderBy(desc(bookmarks.updated_at));
            break;
          case 'created_newest':
            query = query.orderBy(desc(bookmarks.created_at));
            break;
          default:
            // Default to newest first
            query = query.orderBy(desc(bookmarks.date_saved));
        }
      } else {
        // Default sort - newest first
        query = query.orderBy(desc(bookmarks.date_saved));
      }
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      const result = await query;
      return result.map(r => r.bookmark);
    } else {
      // Enhanced search that includes tags, notes, and insights
      // First, prepare the search term
      const searchTerm = `%${options.searchQuery.toLowerCase()}%`;
      
      // Find bookmarks matching search criteria using UNION
      console.log(`Collection search using search term: ${searchTerm}`);

      const matchingBookmarkIds = await this.db.execute(sql`
        SELECT DISTINCT b.id, b.title
        FROM ${bookmarks} b
        JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
        WHERE cb.collection_id = ${collectionId}
          AND (
            LOWER(b.title) LIKE ${searchTerm}
            OR LOWER(b.description) LIKE ${searchTerm}
            OR LOWER(b.url) LIKE ${searchTerm}
            OR LOWER(b.content_html) LIKE ${searchTerm}
          )
          
        UNION
        
        -- Search in notes
        SELECT DISTINCT b.id, b.title
        FROM ${bookmarks} b
        JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
        JOIN ${notes} n ON b.id = n.bookmark_id
        WHERE cb.collection_id = ${collectionId}
          AND LOWER(n.text) LIKE ${searchTerm}
        
        UNION
        
        -- Search in insights
        SELECT DISTINCT b.id, b.title
        FROM ${bookmarks} b
        JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
        JOIN ${insights} i ON b.id = i.bookmark_id
        WHERE cb.collection_id = ${collectionId}
          AND (
            LOWER(i.summary) LIKE ${searchTerm}
          )
        
        UNION
        
        -- Search in tags
        SELECT DISTINCT b.id, b.title
        FROM ${bookmarks} b
        JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
        JOIN ${bookmarkTags} bt ON b.id = bt.bookmark_id
        JOIN ${tags} t ON bt.tag_id = t.id
        WHERE cb.collection_id = ${collectionId}
          AND LOWER(t.name) LIKE ${searchTerm}
      `);
      
      console.log("Tag search results:", matchingBookmarkIds.rows);
      
      // Extract the bookmark IDs from the result
      const ids = matchingBookmarkIds.rows.map(row => row.id);
      
      // If no results, return empty array
      if (ids.length === 0) {
        return [];
      }
      
      // Now get the actual bookmarks with full details
      let query = this.db.select().from(bookmarks)
        .where(inArray(bookmarks.id, ids as string[]))
        .$dynamic();
      
      // Apply sorting
      if (options?.sort) {
        switch (options.sort) {
          case 'newest':
            query = query.orderBy(desc(bookmarks.date_saved));
            break;
          case 'oldest':
            query = query.orderBy(asc(bookmarks.date_saved));
            break;
          case 'recently_updated':
            query = query.orderBy(desc(bookmarks.updated_at));
            break;
          case 'created_newest':
            query = query.orderBy(desc(bookmarks.created_at));
            break;
          default:
            // Default to newest first
            query = query.orderBy(desc(bookmarks.date_saved));
        }
      } else {
        // Default sort - newest first
        query = query.orderBy(desc(bookmarks.date_saved));
      }
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      return await query;
    }
  }
  
  async getBookmarksByCollectionIdCount(collectionId: string, options?: { searchQuery?: string }): Promise<number> {
    if (!options?.searchQuery) {
      // Standard count without enhanced search
      let query = this.db
        .select({
          count: sql<number>`count(*)`
        })
        .from(collectionBookmarks)
        .innerJoin(bookmarks, eq(collectionBookmarks.bookmark_id, bookmarks.id))
        .where(eq(collectionBookmarks.collection_id, collectionId));
      
      const result = await query;
      return result[0]?.count || 0;
    } else {
      // Enhanced search count including notes, insights, and tags
      const searchTerm = `%${options.searchQuery.toLowerCase()}%`;
      
      // Build a count query that counts unique bookmark IDs matching any of our search criteria
      console.log(`Collection count search using term: ${searchTerm}`);
      
      const result = await this.db.execute(sql`
        SELECT COUNT(*) FROM (
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
          WHERE cb.collection_id = ${collectionId}
            AND (
              LOWER(b.title) LIKE ${searchTerm}
              OR LOWER(b.description) LIKE ${searchTerm}
              OR LOWER(b.url) LIKE ${searchTerm}
              OR LOWER(b.content_html) LIKE ${searchTerm}
            )
            
          UNION
          
          -- Search in notes
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
          JOIN ${notes} n ON b.id = n.bookmark_id
          WHERE cb.collection_id = ${collectionId}
            AND LOWER(n.text) LIKE ${searchTerm}
          
          UNION
          
          -- Search in insights
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
          JOIN ${insights} i ON b.id = i.bookmark_id
          WHERE cb.collection_id = ${collectionId}
            AND (
              LOWER(i.summary) LIKE ${searchTerm}
            )
          
          UNION
          
          -- Search in tags
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${collectionBookmarks} cb ON b.id = cb.bookmark_id
          JOIN ${bookmarkTags} bt ON b.id = bt.bookmark_id
          JOIN ${tags} t ON bt.tag_id = t.id
          WHERE cb.collection_id = ${collectionId}
            AND LOWER(t.name) LIKE ${searchTerm}
        ) AS bookmark_search
      `);
      
      return parseInt(result.rows[0].count as string) || 0;
    }
  }
  
  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const result = await this.db
      .select({
        collection: collections
      })
      .from(collectionBookmarks)
      .innerJoin(collections, eq(collectionBookmarks.collection_id, collections.id))
      .where(eq(collectionBookmarks.bookmark_id, bookmarkId));
    
    return result.map(r => r.collection);
  }
  
  async addBookmarkToCollection(collectionId: string, bookmarkId: string): Promise<CollectionBookmark> {
    try {
      // First check if this bookmark is already in the collection
      const existingRelation = await this.db
        .select()
        .from(collectionBookmarks)
        .where(
          and(
            eq(collectionBookmarks.collection_id, collectionId),
            eq(collectionBookmarks.bookmark_id, bookmarkId)
          )
        )
        .limit(1);
        
      // If it already exists, return the existing relationship
      if (existingRelation.length > 0) {
        console.log(`Bookmark ${bookmarkId} is already in collection ${collectionId}, skipping insert`);
        return existingRelation[0];
      }
      
      // Otherwise, create a new relationship
      const [newCollectionBookmark] = await this.db
        .insert(collectionBookmarks)
        .values({
          collection_id: collectionId,
          bookmark_id: bookmarkId
        })
        .returning();
      
      console.log(`Added bookmark ${bookmarkId} to collection ${collectionId}`);
      return newCollectionBookmark;
    } catch (error) {
      console.error(`Error adding bookmark ${bookmarkId} to collection ${collectionId}:`, error);
      
      // Handle unique constraint violation (if our check somehow missed it)
      if (error instanceof Error && error.message.includes('uniqueBookmarkInCollection')) {
        console.log(`Unique constraint prevented duplicate: bookmark ${bookmarkId} in collection ${collectionId}`);
        
        // Retrieve and return the existing record
        const [existingRecord] = await this.db
          .select()
          .from(collectionBookmarks)
          .where(
            and(
              eq(collectionBookmarks.collection_id, collectionId),
              eq(collectionBookmarks.bookmark_id, bookmarkId)
            )
          )
          .limit(1);
          
        return existingRecord;
      }
      
      throw error;
    }
  }
  
  async removeBookmarkFromCollection(collectionId: string, bookmarkId: string): Promise<boolean> {
    try {
      // Use separate eq conditions for simpler and more reliable querying
      const result = await this.db
        .delete(collectionBookmarks)
        .where(and(
          eq(collectionBookmarks.collection_id, collectionId),
          eq(collectionBookmarks.bookmark_id, bookmarkId)
        ))
        .returning();
      
      console.log(`Removed bookmark ${bookmarkId} from collection ${collectionId}: ${result.length > 0}`);
      return result.length > 0;
    } catch (error) {
      console.error(`Database error removing bookmark ${bookmarkId} from collection ${collectionId}:`, error);
      throw error;
    }
  }

  // Collection Tags methods
  async getTagsByCollectionId(collectionId: string): Promise<Tag[]> {
    try {
      // Verify we're getting the correct collection ID
      console.log(`Getting tags for collection ID: ${collectionId}`);
      
      const joinResult = await this.db
        .select({
          tag: tags
        })
        .from(collectionTags)
        .innerJoin(tags, eq(collectionTags.tag_id, tags.id))
        .where(eq(collectionTags.collection_id, collectionId));
      
      const result = joinResult.map(result => result.tag);
      console.log(`Found ${result.length} tags for collection ${collectionId}`);
      
      return result;
    } catch (error) {
      console.error(`Database error retrieving tags for collection ${collectionId}:`, error);
      throw error;
    }
  }

  async getCollectionsByTagId(tagId: string): Promise<Collection[]> {
    try {
      const joinResult = await this.db
        .select({
          collection: collections
        })
        .from(collectionTags)
        .innerJoin(collections, eq(collectionTags.collection_id, collections.id))
        .where(eq(collectionTags.tag_id, tagId));
      
      return joinResult.map(result => result.collection);
    } catch (error) {
      console.error(`Database error retrieving collections for tag ${tagId}:`, error);
      throw error;
    }
  }

  async addTagToCollection(collectionId: string, tagId: string): Promise<CollectionTag> {
    try {
      // Log the tag being added
      console.log(`Adding tag ID ${tagId} to collection ${collectionId} (storage method)`);
      
      // First check if the relation already exists
      const existingRelation = await this.db
        .select()
        .from(collectionTags)
        .where(
          and(
            eq(collectionTags.collection_id, collectionId),
            eq(collectionTags.tag_id, tagId)
          )
        );
      
      if (existingRelation.length > 0) {
        console.log(`Tag ID ${tagId} is already in collection ${collectionId}, skipping`);
        return existingRelation[0];
      }
      
      // Create new relation
      console.log(`Inserting new tag relation: collection=${collectionId}, tag=${tagId}`);
      const [newCollectionTag] = await this.db
        .insert(collectionTags)
        .values({ collection_id: collectionId, tag_id: tagId })
        .returning();
      
      console.log(`Successfully added tag ID ${tagId} to collection ${collectionId}`);
      
      // Process any existing bookmarks with this tag for auto-adding
      await this.processTaggedBookmarksForCollection(collectionId);
      
      return newCollectionTag;
    } catch (error) {
      console.error(`Database error adding tag ${tagId} to collection ${collectionId}:`, error);
      throw error;
    }
  }

  async removeTagFromCollection(collectionId: string, tagId: string): Promise<boolean> {
    try {
      const collection = await this.getCollection(collectionId);
      
      if (!collection || !collection.auto_add_tagged) {
        // Just remove the tag association if auto-adding is disabled
        const result = await this.db
          .delete(collectionTags)
          .where(
            and(
              eq(collectionTags.collection_id, collectionId),
              eq(collectionTags.tag_id, tagId)
            )
          )
          .returning({ id: collectionTags.id });
        
        return result.length > 0;
      }

      // Find bookmarks that have the specific removed tag
      const bookmarksWithRemovedTag = await this.db
        .select({
          bookmark_id: bookmarkTags.bookmark_id
        })
        .from(bookmarkTags)
        .where(eq(bookmarkTags.tag_id, tagId));
      
      // Now remove the tag from the collection
      const result = await this.db
        .delete(collectionTags)
        .where(
          and(
            eq(collectionTags.collection_id, collectionId),
            eq(collectionTags.tag_id, tagId)
          )
        )
        .returning({ id: collectionTags.id });
      
      // Remove only bookmarks that were automatically added because of this specific tag
      let removedCount = 0;
      for (const { bookmark_id } of bookmarksWithRemovedTag) {
        const isRemoved = await this.removeBookmarkFromCollection(collectionId, bookmark_id);
        if (isRemoved) {
          removedCount++;
          console.log(`Removed bookmark ${bookmark_id} from collection ${collectionId} for removed tag ${tagId}`);
        }
      }
      
      console.log(`Removed ${removedCount} bookmarks from collection ${collectionId} associated with tag ${tagId}`);
      
      return result.length > 0;
    } catch (error) {
      console.error(`Database error removing tag ${tagId} from collection ${collectionId}:`, error);
      throw error;
    }
  }

  async processTaggedBookmarksForCollection(collectionId: string): Promise<number> {
    try {
      // First, check if auto-adding is enabled for this collection
      const collection = await this.getCollection(collectionId);
      
      if (!collection || !collection.auto_add_tagged) {
        return 0;
      }
      
      // Store the user ID of the collection owner to ensure we only process their bookmarks
      const collectionUserId = collection.user_id;
      
      // Get all tags for this collection
      const collectionTags = await this.getTagsByCollectionId(collectionId);
      
      // Set to track all processed bookmarks (added or removed)
      let processedCount = 0;
      
      // Get existing bookmarks in the collection
      const existingBookmarks = await this.getBookmarksByCollectionId(collectionId);
      const existingBookmarkIds = new Set(existingBookmarks.map(b => b.id));
      
      const tagIds = collectionTags.map(tag => tag.id);
      
      // Find all bookmarks that have any of these tags AND belong to the collection owner
      // This query gets all bookmarks that have at least one of the collection's tags
      // If there are no tags, this will return an empty array
      const joinResult = await this.db
        .selectDistinct({
          bookmark_id: bookmarkTags.bookmark_id
        })
        .from(bookmarkTags)
        .innerJoin(bookmarks, eq(bookmarkTags.bookmark_id, bookmarks.id))
        .where(
          and(
            tagIds.length > 0 ? inArray(bookmarkTags.tag_id, tagIds) : sql`1=0`, // If no tags, use a condition that returns no results
            eq(bookmarks.user_id, collectionUserId) // Only include bookmarks from the collection owner
          )
        );
      
      // Create a set of bookmark IDs that should be in the collection
      // These are bookmarks that have at least one of the collection's tags AND belong to the same user
      const shouldBeInCollectionIds = new Set(joinResult.map(r => r.bookmark_id));
      
      // Add bookmarks that are not already in the collection but have matching tags
      let addedCount = 0;
      for (const { bookmark_id } of joinResult) {
        if (!existingBookmarkIds.has(bookmark_id)) {
          await this.addBookmarkToCollection(collectionId, bookmark_id);
          addedCount++;
          processedCount++;
        }
      }
      
      // We don't remove any bookmarks in this method - that's handled in removeTagFromCollection
      // This method only adds bookmarks that should be in the collection based on tags
      let removedCount = 0;
      
      console.log(`Added ${addedCount} and removed ${removedCount} bookmarks from collection ${collectionId} based on tags`);
      return processedCount;
    } catch (error) {
      console.error(`Database error processing tagged bookmarks for collection ${collectionId}:`, error);
      throw error;
    }
  }
  
  // Bookmarks
  async getBookmarks(userId?: string, options?: { limit?: number; offset?: number; sort?: string; searchQuery?: string }): Promise<Bookmark[]> {
    if (!options?.searchQuery) {
      // If no search query, use the standard query without joins
      let query = this.db.select().from(bookmarks).$dynamic();
      
      // Apply user filter if provided
      if (userId) {
        query = query.where(eq(bookmarks.user_id, userId));
      }
      
      // Apply sorting
      if (options?.sort) {
        switch (options.sort) {
          case 'newest':
            query = query.orderBy(desc(bookmarks.date_saved));
            break;
          case 'oldest':
            query = query.orderBy(bookmarks.date_saved);
            break;
          case 'recently_updated':
            query = query.orderBy(desc(bookmarks.updated_at));
            break;
          case 'created_newest':
            // If created_at exists, use it, otherwise fall back to date_saved
            query = query.orderBy(desc(bookmarks.created_at), desc(bookmarks.date_saved));
            break;
          default:
            // Default to newest
            query = query.orderBy(desc(bookmarks.date_saved));
        }
      } else {
        // Default sort - newest first
        query = query.orderBy(desc(bookmarks.date_saved));
      }
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      return await query;
    } else {
      // Enhanced search that includes tags, notes, and insights
      // First, prepare the search term
      const searchTerm = `%${options.searchQuery.toLowerCase()}%`;
      
      // Build a complex query that finds bookmarks matching any of our search criteria
      // using a UNION approach to deduplicate bookmarks
      const userIdFilter = userId ? sql`(b.user_id = ${userId})` : sql`(b.user_id IS NOT NULL OR b.user_id IS NULL)`;
      
      const matchingBookmarkIds = await this.db.execute(sql`
        SELECT DISTINCT b.id
        FROM ${bookmarks} b
        WHERE
          ${userIdFilter}
          AND (
            LOWER(b.title) LIKE ${searchTerm}
            OR LOWER(b.description) LIKE ${searchTerm}
            OR LOWER(b.url) LIKE ${searchTerm}
            OR LOWER(b.content_html) LIKE ${searchTerm}
          )
          
        UNION
        
        -- Search in notes
        SELECT DISTINCT b.id
        FROM ${bookmarks} b
        JOIN ${notes} n ON b.id = n.bookmark_id
        WHERE
          ${userIdFilter}
          AND LOWER(n.text) LIKE ${searchTerm}
        
        UNION
        
        -- Search in insights
        SELECT DISTINCT b.id
        FROM ${bookmarks} b
        JOIN ${insights} i ON b.id = i.bookmark_id
        WHERE
          ${userIdFilter}
          AND (
            LOWER(i.summary) LIKE ${searchTerm}
          )
        
        UNION
        
        -- Search in tags
        SELECT DISTINCT b.id
        FROM ${bookmarks} b
        JOIN ${bookmarkTags} bt ON b.id = bt.bookmark_id
        JOIN ${tags} t ON bt.tag_id = t.id
        WHERE
          ${userIdFilter}
          AND LOWER(t.name) LIKE ${searchTerm}
      `);
      
      // Extract the bookmark IDs from the result
      const ids = matchingBookmarkIds.rows.map(row => row.id);
      
      // If no results, return empty array
      if (ids.length === 0) {
        return [];
      }
      
      // Now get the actual bookmarks with full details
      let query = this.db.select().from(bookmarks)
        .where(inArray(bookmarks.id, ids as string[]))
        .$dynamic();
      
      // Apply sorting
      if (options?.sort) {
        switch (options.sort) {
          case 'newest':
            query = query.orderBy(desc(bookmarks.date_saved));
            break;
          case 'oldest':
            query = query.orderBy(bookmarks.date_saved);
            break;
          case 'recently_updated':
            query = query.orderBy(desc(bookmarks.updated_at));
            break;
          case 'created_newest':
            // If created_at exists, use it, otherwise fall back to date_saved
            query = query.orderBy(desc(bookmarks.created_at), desc(bookmarks.date_saved));
            break;
          default:
            // Default to newest
            query = query.orderBy(desc(bookmarks.date_saved));
        }
      } else {
        // Default sort - newest first
        query = query.orderBy(desc(bookmarks.date_saved));
      }
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      
      if (options?.offset) {
        query = query.offset(options.offset);
      }
      
      return await query;
    }
  }
  
  async getBookmarksCount(userId?: string, options?: { searchQuery?: string }): Promise<number> {
    if (!options?.searchQuery) {
      // Standard count without search
      let query = this.db.select({ count: sql<number>`COUNT(*)` }).from(bookmarks).$dynamic();
      
      // Apply user filter if provided
      if (userId) {
        query = query.where(eq(bookmarks.user_id, userId));
      }
      
      const [{ count }] = await query;
      return count || 0;
    } else {
      // Enhanced search count including tags, notes, and insights
      const searchTerm = `%${options.searchQuery.toLowerCase()}%`;
      
      // Build a count query that counts unique bookmark IDs matching any of our search criteria
      const userIdFilter = userId ? sql`(b.user_id = ${userId})` : sql`(b.user_id IS NOT NULL OR b.user_id IS NULL)`;

      const result = await this.db.execute(sql`
        SELECT COUNT(*) FROM (
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          WHERE
            ${userIdFilter}
            AND (
              LOWER(b.title) LIKE ${searchTerm}
              OR LOWER(b.description) LIKE ${searchTerm}
              OR LOWER(b.url) LIKE ${searchTerm}
              OR LOWER(b.content_html) LIKE ${searchTerm}
            )
            
          UNION
          
          -- Search in notes
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${notes} n ON b.id = n.bookmark_id
          WHERE
            ${userIdFilter}
            AND LOWER(n.text) LIKE ${searchTerm}
          
          UNION
          
          -- Search in insights
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${insights} i ON b.id = i.bookmark_id
          WHERE
            ${userIdFilter}
            AND (
              LOWER(i.summary) LIKE ${searchTerm}
            )
          
          UNION
          
          -- Search in tags
          SELECT DISTINCT b.id
          FROM ${bookmarks} b
          JOIN ${bookmarkTags} bt ON b.id = bt.bookmark_id
          JOIN ${tags} t ON bt.tag_id = t.id
          WHERE
            ${userIdFilter}
            AND LOWER(t.name) LIKE ${searchTerm}
        ) AS bookmark_search
      `);
      
      return parseInt(result.rows[0].count as string) || 0;
    }
  }
  
  async getBookmark(id: string): Promise<Bookmark | undefined> {
    const [bookmark] = await this.db.select().from(bookmarks).where(eq(bookmarks.id, id));
    
    if (!bookmark) return undefined;
    
    // Fetch related data in parallel to improve performance
    const [bookmarkNotes, bookmarkHighlights, bookmarkScreenshots, bookmarkInsight] = await Promise.all([
      this.getNotesByBookmarkId(id),
      this.getHighlightsByBookmarkId(id),
      this.getScreenshotsByBookmarkId(id),
      this.getInsightByBookmarkId(id)
    ]);
    
    // TypeScript complains about direct assignment of these properties,
    // but they will be added to the returned object via the shared/types.ts interface
    const result = bookmark as any;
    result.notes = bookmarkNotes;
    result.highlights = bookmarkHighlights;
    result.screenshots = bookmarkScreenshots;
    result.insights = bookmarkInsight;
    
    return result as Bookmark;
  }
  
  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    // Ensure date_saved is a Date object before inserting
    const bookmarkData = {
      ...bookmark,
      date_saved: new Date()
    };
    
    const [newBookmark] = await this.db.insert(bookmarks).values(bookmarkData).returning();
    return newBookmark;
  }
  
  async updateBookmark(id: string, bookmarkUpdate: Partial<InsertBookmark>): Promise<Bookmark | undefined> {
    const [updatedBookmark] = await this.db
      .update(bookmarks)
      .set({
        ...bookmarkUpdate,
        updated_at: new Date()
      })
      .where(eq(bookmarks.id, id))
      .returning();
    
    return updatedBookmark;
  }
  
  async deleteBookmark(id: string): Promise<boolean> {
    const result = await this.db.delete(bookmarks).where(eq(bookmarks.id, id)).returning({ id: bookmarks.id });
    return result.length > 0;
  }
  
  // Notes
  async getNotesByBookmarkId(bookmarkId: string): Promise<Note[]> {
    return await this.db.select().from(notes).where(eq(notes.bookmark_id, bookmarkId));
  }
  
  async createNote(note: InsertNote): Promise<Note> {
    // Ensure timestamp is a Date object
    const noteData = {
      ...note,
      timestamp: new Date()
    };
    
    const [newNote] = await this.db.insert(notes).values(noteData).returning();
    return newNote;
  }
  
  async deleteNote(id: string): Promise<boolean> {
    const result = await this.db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    return result.length > 0;
  }
  
  // Screenshots
  async getScreenshotsByBookmarkId(bookmarkId: string): Promise<Screenshot[]> {
    return await this.db.select().from(screenshots).where(eq(screenshots.bookmark_id, bookmarkId));
  }
  
  async createScreenshot(screenshot: InsertScreenshot): Promise<Screenshot> {
    // Ensure uploaded_at is a Date object
    const screenshotData = {
      ...screenshot,
      uploaded_at: new Date()
    };
    
    const [newScreenshot] = await this.db.insert(screenshots).values(screenshotData).returning();
    return newScreenshot;
  }
  
  async deleteScreenshot(id: string): Promise<boolean> {
    const result = await this.db.delete(screenshots).where(eq(screenshots.id, id)).returning({ id: screenshots.id });
    return result.length > 0;
  }
  
  // Highlights
  async getHighlightsByBookmarkId(bookmarkId: string): Promise<Highlight[]> {
    return await this.db.select().from(highlights).where(eq(highlights.bookmark_id, bookmarkId));
  }
  
  async createHighlight(highlight: InsertHighlight): Promise<Highlight> {
    const [newHighlight] = await this.db.insert(highlights).values(highlight).returning();
    return newHighlight;
  }
  
  async deleteHighlight(id: string): Promise<boolean> {
    const result = await this.db.delete(highlights).where(eq(highlights.id, id)).returning({ id: highlights.id });
    return result.length > 0;
  }
  
  // Insights
  async getInsightByBookmarkId(bookmarkId: string): Promise<Insight | undefined> {
    const [insight] = await this.db.select().from(insights).where(eq(insights.bookmark_id, bookmarkId));
    return insight;
  }
  
  async createInsight(insight: InsertInsight): Promise<Insight> {
    const [newInsight] = await this.db.insert(insights).values(insight).returning();
    return newInsight;
  }
  
  async updateInsight(id: string, insightUpdate: Partial<InsertInsight>): Promise<Insight | undefined> {
    const [updatedInsight] = await this.db
      .update(insights)
      .set(insightUpdate)
      .where(eq(insights.id, id))
      .returning();
    
    return updatedInsight;
  }
  
  // Activities
  async getActivities(userId?: string, options?: { limit?: number; offset?: number }): Promise<Activity[]> {
    // Start building the query
    let query = this.db.select().from(activities).orderBy(desc(activities.timestamp)).$dynamic();
    
    // Add user filter if userId is provided
    if (userId) {
      query = query.where(eq(activities.user_id, userId));
    }
    
    // Add pagination
    if (options?.offset !== undefined) {
      query = query.offset(options.offset);
    }
    
    if (options?.limit !== undefined) {
      query = query.limit(options.limit);
    }
    
    return await query;
  }
  
  // Get total count of activities (for pagination)
  async getActivitiesCount(userId?: string): Promise<number> {
    let query = this.db.select({ count: sql<number>`count(*)` }).from(activities).$dynamic();
    
    if (userId) {
      query = query.where(eq(activities.user_id, userId));
    }
    
    const result = await query;
    return result[0]?.count || 0;
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    // Ensure timestamp is a Date object
    const activityData = {
      ...activity,
      user_id: activity.user_id || null, // Make sure user_id is included
      timestamp: new Date()
    };
    
    const [newActivity] = await this.db.insert(activities).values(activityData).returning();
    return newActivity;
  }
  
  // Tags
  async getTags(userId?: string): Promise<Tag[]> {
    try {
      // Modified approach: Always return ALL tags to ensure users can find existing tags
      // This helps with the tag search functionality
      
      // For user-specific views, we could add extra filtering later if needed,
      // but for now returning all tags is the best approach
      
      // Get all tags directly - no joins
      const allTags = await this.db
        .select()
        .from(tags)
        .orderBy(desc(tags.count)); // Order by popularity (most used first)
        
      return allTags;
    } catch (error) {
      console.error("Error retrieving tags:", error);
      return [];
    }
  }
  
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await this.db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }
  
  async getTagByName(name: string): Promise<Tag | undefined> {
    if (!name) return undefined;
    
    // Use SQL LOWER function for case-insensitive comparison
    const [tag] = await this.db
      .select()
      .from(tags)
      .where(sql`LOWER(${tags.name}) = LOWER(${name})`);
    
    return tag;
  }
  
  async createTag(tag: InsertTag): Promise<Tag> {
    const [newTag] = await this.db.insert(tags).values(tag).returning();
    return newTag;
  }
  
  async updateTag(id: string, tagUpdate: Partial<InsertTag>): Promise<Tag | undefined> {
    const [updatedTag] = await this.db
      .update(tags)
      .set(tagUpdate)
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async incrementTagCount(id: string): Promise<Tag | undefined> {
    const [tag] = await this.db.select().from(tags).where(eq(tags.id, id));
    if (!tag) return undefined;
    
    const [updatedTag] = await this.db
      .update(tags)
      .set({ count: tag.count + 1 })
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async decrementTagCount(id: string): Promise<Tag | undefined> {
    const [tag] = await this.db.select().from(tags).where(eq(tags.id, id));
    if (!tag) return undefined;
    
    const [updatedTag] = await this.db
      .update(tags)
      .set({ count: Math.max(0, tag.count - 1) })
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async deleteTag(id: string): Promise<boolean> {
    const result = await this.db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
    return result.length > 0;
  }
  
  // BookmarkTags
  async getTagsByBookmarkId(bookmarkId: string): Promise<Tag[]> {
    // Get tags from the normalized system
    const joinResult = await this.db
      .select({
        tag: tags
      })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tag_id, tags.id))
      .where(eq(bookmarkTags.bookmark_id, bookmarkId));
    
    return joinResult.map(result => result.tag);
  }
  
  async getAllBookmarkTags(bookmarkIds?: string[]): Promise<{[bookmarkId: string]: Tag[]}> {
    // Create a map to store tags for each bookmark
    const bookmarkTagsMap: {[bookmarkId: string]: Tag[]} = {};
    
    // Construct the query to get all bookmark-tag relationships
    let query = this.db
      .select({
        bookmarkId: bookmarkTags.bookmark_id,
        tag: tags
      })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tag_id, tags.id))
      .$dynamic();
    
    // If specific bookmark IDs are provided, filter by those
    if (bookmarkIds && bookmarkIds.length > 0) {
      query = query.where(inArray(bookmarkTags.bookmark_id, bookmarkIds));
    }
    
    // Execute the query
    const results = await query;
    
    // Process the results into a map
    for (const result of results) {
      if (!bookmarkTagsMap[result.bookmarkId]) {
        bookmarkTagsMap[result.bookmarkId] = [];
      }
      bookmarkTagsMap[result.bookmarkId].push(result.tag);
    }
    
    return bookmarkTagsMap;
  }
  
  async getBookmarksByTagId(tagId: string): Promise<Bookmark[]> {
    // Get bookmarks from the normalized system only
    const joinResult = await this.db
      .select({
        bookmark: bookmarks
      })
      .from(bookmarkTags)
      .innerJoin(bookmarks, eq(bookmarkTags.bookmark_id, bookmarks.id))
      .where(eq(bookmarkTags.tag_id, tagId));
    
    return joinResult.map(result => result.bookmark);
  }
  
  async addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag> {
    const [newBookmarkTag] = await this.db
      .insert(bookmarkTags)
      .values({ bookmark_id: bookmarkId, tag_id: tagId })
      .returning();
    
    // Increment the tag count
    await this.incrementTagCount(tagId);
    
    return newBookmarkTag;
  }
  
  async removeTagFromBookmark(bookmarkId: string, tagId: string): Promise<boolean> {
    try {
      // Use the same improved approach as in removeBookmarkFromCollection
      const result = await this.db
        .delete(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.bookmark_id, bookmarkId),
            eq(bookmarkTags.tag_id, tagId)
          )
        )
        .returning({ id: bookmarkTags.id });
      
      if (result.length > 0) {
        // Decrement the tag count
        await this.decrementTagCount(tagId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Database error removing tag ${tagId} from bookmark ${bookmarkId}:`, error);
      throw error;
    }
  }

  // Chat Sessions
  async getChatSessions(userId?: string): Promise<ChatSession[]> {
    if (userId) {
      return await this.db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.user_id, userId))
        .orderBy(desc(chatSessions.updated_at));
    }
    return await this.db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updated_at));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await this.db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id));
    return session;
  }

  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const now = new Date();
    const sessionData = {
      ...session,
      created_at: now,
      updated_at: now,
      user_id: session.user_id || null // Make sure user_id is included
    };
    
    const [newSession] = await this.db
      .insert(chatSessions)
      .values(sessionData)
      .returning();
    
    return newSession;
  }

  async updateChatSession(id: string, sessionUpdate: Partial<InsertChatSession>): Promise<ChatSession | undefined> {
    // Always update the updated_at timestamp
    const updates = {
      ...sessionUpdate,
      updated_at: new Date()
    };

    const [updatedSession] = await this.db
      .update(chatSessions)
      .set(updates)
      .where(eq(chatSessions.id, id))
      .returning();
    
    return updatedSession;
  }

  async deleteChatSession(id: string): Promise<boolean> {
    // Delete all messages in the session first
    await this.deleteChatMessagesBySessionId(id);
    
    // Then delete the session itself
    const result = await this.db
      .delete(chatSessions)
      .where(eq(chatSessions.id, id))
      .returning({ id: chatSessions.id });
    
    return result.length > 0;
  }
  
  // Chat Messages
  async getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
    return await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .orderBy(chatMessages.timestamp);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const messageData = {
      ...message,
      timestamp: new Date()
    };
    
    const [newMessage] = await this.db
      .insert(chatMessages)
      .values(messageData)
      .returning();
    
    // Update the parent session's updated_at timestamp
    await this.updateChatSession(message.session_id, {});
    
    return newMessage;
  }

  async deleteChatMessagesBySessionId(sessionId: string): Promise<boolean> {
    const result = await this.db
      .delete(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .returning({ id: chatMessages.id });
    
    return result.length > 0;
  }
  
  // Settings
  async getSettings(userId?: string): Promise<Setting[]> {
    if (userId) {
      return await this.db
        .select()
        .from(settings)
        .where(eq(settings.user_id, userId))
        .orderBy(settings.key);
    }
    return await this.db
      .select()
      .from(settings)
      .orderBy(settings.key);
  }
  
  async getSetting(key: string): Promise<Setting | undefined> {
    const result = await this.db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    
    return result[0];
  }
  
  async createSetting(setting: InsertSetting): Promise<Setting> {
    const [newSetting] = await this.db
      .insert(settings)
      .values({
        ...setting,
        user_id: setting.user_id || null, // Make sure user_id is included
        updated_at: new Date()
      })
      .returning();
    
    return newSetting;
  }
  
  async updateSetting(key: string, value: string): Promise<Setting | undefined> {
    const result = await this.db
      .update(settings)
      .set({
        value,
        updated_at: new Date()
      })
      .where(eq(settings.key, key))
      .returning();
    
    return result[0];
  }
  
  async deleteSetting(key: string): Promise<boolean> {
    const result = await this.db
      .delete(settings)
      .where(eq(settings.key, key))
      .returning({ id: settings.id });
    
    return result.length > 0;
  }
  
  // X.com integration
  async createXCredentials(credentials: InsertXCredentials): Promise<XCredentials> {
    const [newCredentials] = await this.db.insert(xCredentials)
      .values({
        ...credentials,
        created_at: new Date(),
        updated_at: new Date(),
        last_sync_at: null
      })
      .returning();
    return newCredentials;
  }
  
  async getXCredentialsByUserId(userId: string): Promise<XCredentials | undefined> {
    const [credentials] = await this.db.select()
      .from(xCredentials)
      .where(eq(xCredentials.user_id, userId));
    return credentials;
  }
  
  async updateXCredentials(id: string, credentialsUpdate: Partial<XCredentials>): Promise<XCredentials | undefined> {
    const [updatedCredentials] = await this.db.update(xCredentials)
      .set({
        ...credentialsUpdate,
        updated_at: new Date()
      })
      .where(eq(xCredentials.id, id))
      .returning();
    return updatedCredentials;
  }
  
  async createXFolder(folder: InsertXFolder): Promise<XFolder> {
    const [newFolder] = await this.db.insert(xFolders)
      .values({
        ...folder,
        created_at: new Date(),
        updated_at: new Date(),
        last_sync_at: new Date()
      })
      .returning();
    return newFolder;
  }
  
  async getXFoldersByUserId(userId: string): Promise<XFolder[]> {
    return await this.db.select()
      .from(xFolders)
      .where(eq(xFolders.user_id, userId));
  }
  
  async updateXFolderLastSync(id: string): Promise<XFolder | undefined> {
    const [updatedFolder] = await this.db.update(xFolders)
      .set({
        last_sync_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(xFolders.id, id))
      .returning();
    return updatedFolder;
  }
  
  async getStoredXFolders(userId: string): Promise<XFolder[]> {
    console.log(`DB: Getting stored X folders for user ${userId}`);
    return await this.db.select()
      .from(xFolders)
      .where(eq(xFolders.user_id, userId));
  }
  
  async updateXFolder(id: string, folderUpdate: Partial<XFolder>): Promise<XFolder | undefined> {
    console.log(`DB: Updating X folder ${id}`);
    const [updatedFolder] = await this.db.update(xFolders)
      .set({
        ...folderUpdate,
        updated_at: new Date()
      })
      .where(eq(xFolders.id, id))
      .returning();
    return updatedFolder;
  }
  
  async findBookmarkByExternalId(userId: string, externalId: string, source: string): Promise<Bookmark | undefined> {
    const [bookmark] = await this.db.select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.user_id, userId),
          eq(bookmarks.external_id, externalId),
          eq(bookmarks.source, source)
        )
      );
    return bookmark;
  }
  
  // Reports methods
  async getReportsByUserId(userId: string): Promise<Report[]> {
    const userReports = await this.db.select()
      .from(reports)
      .where(eq(reports.user_id, userId))
      .orderBy(desc(reports.created_at));
    
    // Ensure all date fields are properly converted to strings
    return userReports.map(report => {
      // Convert only if the fields are Date objects and not already strings
      if (report.time_period_start instanceof Date) {
        report.time_period_start = report.time_period_start.toISOString();
      }
      if (report.time_period_end instanceof Date) {
        report.time_period_end = report.time_period_end.toISOString();
      }
      return report;
    });
  }
  
  async getReport(id: string): Promise<Report | undefined> {
    const [report] = await this.db.select()
      .from(reports)
      .where(eq(reports.id, id));
    
    // Ensure the time_period fields are properly converted to date strings
    if (report) {
      // Convert only if the fields are Date objects and not already strings
      if (report.time_period_start instanceof Date) {
        report.time_period_start = report.time_period_start.toISOString();
      }
      if (report.time_period_end instanceof Date) {
        report.time_period_end = report.time_period_end.toISOString();
      }
    }
    
    return report;
  }
  
  async createReport(report: InsertReport): Promise<Report> {
    const [newReport] = await this.db.insert(reports)
      .values({
        ...report,
        created_at: new Date(),
      })
      .returning();
    
    // Ensure dates are formatted as strings before returning
    if (newReport.time_period_start instanceof Date) {
      newReport.time_period_start = newReport.time_period_start.toISOString();
    }
    if (newReport.time_period_end instanceof Date) {
      newReport.time_period_end = newReport.time_period_end.toISOString();
    }
    
    return newReport;
  }
  
  async updateReport(id: string, reportUpdate: Partial<InsertReport>): Promise<Report | undefined> {
    const [updatedReport] = await this.db.update(reports)
      .set(reportUpdate)
      .where(eq(reports.id, id))
      .returning();
    
    // Ensure dates are formatted as strings before returning
    if (updatedReport && updatedReport.time_period_start instanceof Date) {
      updatedReport.time_period_start = updatedReport.time_period_start.toISOString();
    }
    if (updatedReport && updatedReport.time_period_end instanceof Date) {
      updatedReport.time_period_end = updatedReport.time_period_end.toISOString();
    }
    
    return updatedReport;
  }
  
  async updateReportStatus(id: string, status: "generating" | "completed" | "failed"): Promise<Report | undefined> {
    const [updatedReport] = await this.db.update(reports)
      .set({ status })
      .where(eq(reports.id, id))
      .returning();
    
    // Ensure dates are formatted as strings before returning
    if (updatedReport && updatedReport.time_period_start instanceof Date) {
      updatedReport.time_period_start = updatedReport.time_period_start.toISOString();
    }
    if (updatedReport && updatedReport.time_period_end instanceof Date) {
      updatedReport.time_period_end = updatedReport.time_period_end.toISOString();
    }
    
    return updatedReport;
  }
  
  async deleteReport(id: string): Promise<boolean> {
    // First delete all bookmark associations
    await this.db.delete(reportBookmarks)
      .where(eq(reportBookmarks.report_id, id));
    
    // Then delete the report
    const result = await this.db.delete(reports)
      .where(eq(reports.id, id))
      .returning();
    return result.length > 0;
  }
  
  // Report Bookmarks methods
  async getReportBookmarks(reportId: string): Promise<ReportBookmark[]> {
    return await this.db.select()
      .from(reportBookmarks)
      .where(eq(reportBookmarks.report_id, reportId));
  }
  
  async getBookmarksByReportId(reportId: string): Promise<Bookmark[]> {
    const reportBookmarkRows = await this.db.select({
      bookmarkId: reportBookmarks.bookmark_id
    })
    .from(reportBookmarks)
    .where(eq(reportBookmarks.report_id, reportId));
    
    const bookmarkIds = reportBookmarkRows.map(row => row.bookmarkId);
    
    if (bookmarkIds.length === 0) {
      return [];
    }
    
    return await this.db.select()
      .from(bookmarks)
      .where(inArray(bookmarks.id, bookmarkIds));
  }
  
  async getBookmarksWithInsightsAndTags(userId: string, since: Date, limit?: number): Promise<{
    bookmark: Bookmark;
    insight?: Insight;
    tags: Tag[];
  }[]> {
    // 1. Get recent bookmarks first
    let bookmarksQuery = this.db.select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.user_id, userId),
          sql`${bookmarks.date_saved} >= ${since}`
        )
      )
      .orderBy(desc(bookmarks.date_saved))
      .$dynamic();
    
    if (limit) {
      bookmarksQuery = bookmarksQuery.limit(limit);
    }
    
    const recentBookmarks = await bookmarksQuery;
    
    if (recentBookmarks.length === 0) {
      return [];
    }
    
    // 2. Get all bookmark IDs
    const bookmarkIds = recentBookmarks.map(bookmark => bookmark.id);
    
    // 3. Get insights for these bookmarks
    const bookmarkInsights = await this.db.select()
      .from(insights)
      .where(inArray(insights.bookmark_id, bookmarkIds));
    
    // Map insights by bookmark_id for easy lookup
    const insightsByBookmarkId = new Map<string, Insight>();
    bookmarkInsights.forEach(insight => {
      insightsByBookmarkId.set(insight.bookmark_id, insight);
    });
    
    // 4. Get tags for these bookmarks
    const bookmarkTagRelations = await this.db.select({
      bookmarkId: bookmarkTags.bookmark_id,
      tagId: bookmarkTags.tag_id
    })
    .from(bookmarkTags)
    .where(inArray(bookmarkTags.bookmark_id, bookmarkIds));
    
    // Get all unique tag IDs
    const tagIds = Array.from(new Set(bookmarkTagRelations.map(rel => rel.tagId)));
    
    // Get all tags
    const allTags = await this.db.select()
      .from(tags)
      .where(inArray(tags.id, tagIds));
    
    // Map tags by ID for easy lookup
    const tagsById = new Map<string, Tag>();
    allTags.forEach(tag => {
      tagsById.set(tag.id, tag);
    });
    
    // Group tags by bookmark ID
    const tagsByBookmarkId = new Map<string, Tag[]>();
    bookmarkTagRelations.forEach(rel => {
      const tag = tagsById.get(rel.tagId);
      if (tag) {
        if (!tagsByBookmarkId.has(rel.bookmarkId)) {
          tagsByBookmarkId.set(rel.bookmarkId, []);
        }
        tagsByBookmarkId.get(rel.bookmarkId)!.push(tag);
      }
    });
    
    // 5. Assemble the final result
    return recentBookmarks.map(bookmark => {
      return {
        bookmark,
        insight: insightsByBookmarkId.get(bookmark.id),
        tags: tagsByBookmarkId.get(bookmark.id) || []
      };
    });
  }
  
  async addBookmarkToReport(reportId: string, bookmarkId: string): Promise<ReportBookmark> {
    const [newReportBookmark] = await this.db.insert(reportBookmarks)
      .values({
        report_id: reportId,
        bookmark_id: bookmarkId
      })
      .returning();
    return newReportBookmark;
  }
  
  async removeBookmarkFromReport(reportId: string, bookmarkId: string): Promise<boolean> {
    const result = await this.db.delete(reportBookmarks)
      .where(
        and(
          eq(reportBookmarks.report_id, reportId),
          eq(reportBookmarks.bookmark_id, bookmarkId)
        )
      )
      .returning();
    return result.length > 0;
  }
}
