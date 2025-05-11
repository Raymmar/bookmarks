import { 
  bookmarks, Bookmark, InsertBookmark,
  notes, Note, InsertNote,
  screenshots, Screenshot, InsertScreenshot,
  highlights, Highlight, InsertHighlight,
  insights, Insight, InsertInsight,
  activities, Activity, InsertActivity,
  tags, Tag, InsertTag,
  bookmarkTags, BookmarkTag, InsertBookmarkTag,
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
import { db } from "./db";
import { eq, desc, sql, inArray, and } from "drizzle-orm";

// Storage interface
export interface IStorage {
  // Database access
  getDb(): typeof db;
  
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
  getBookmarks(userId?: string, options?: { limit?: number; offset?: number; sort?: string }): Promise<Bookmark[]>;
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
  getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]>;
  getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]>;
  addBookmarkToCollection(collectionId: string, bookmarkId: string): Promise<CollectionBookmark>;
  removeBookmarkFromCollection(collectionId: string, bookmarkId: string): Promise<boolean>;
  
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
  getActivities(): Promise<Activity[]>;
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
  getChatSessions(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatSession(session: InsertChatSession): Promise<ChatSession>;
  updateChatSession(id: string, session: Partial<InsertChatSession>): Promise<ChatSession | undefined>;
  deleteChatSession(id: string): Promise<boolean>;
  
  // Chat Messages
  getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  deleteChatMessagesBySessionId(sessionId: string): Promise<boolean>;
  
  // Settings
  getSettings(): Promise<Setting[]>;
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

// In-memory storage implementation as a fallback
export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private bookmarks: Map<string, Bookmark>;
  private notes: Map<string, Note>;
  private screenshots: Map<string, Screenshot>;
  private highlights: Map<string, Highlight>;
  private insights: Map<string, Insight>;
  private activities: Map<string, Activity>;
  private collections: Map<string, Collection>;
  private collectionBookmarks: Map<string, CollectionBookmark>;
  private tags: Map<string, Tag>;
  private bookmarkTags: Map<string, BookmarkTag>;
  
  // Chat persistence
  private chatSessions: Map<string, ChatSession>;
  private chatMessages: Map<string, ChatMessage>;
  
  // Settings
  private settings: Map<string, Setting>;
  
  // Reports
  private reports: Map<string, Report>;
  private reportBookmarks: Map<string, ReportBookmark>;
  
  // X.com integration
  private xCredentials: Map<string, XCredentials>;
  private xFolders: Map<string, XFolder>;
  
  // Database access - this is just a stub for the in-memory implementation
  getDb(): typeof db {
    throw new Error("Cannot access database directly in MemStorage mode");
  }
  
  constructor() {
    this.users = new Map();
    this.bookmarks = new Map();
    this.notes = new Map();
    this.screenshots = new Map();
    this.highlights = new Map();
    this.insights = new Map();
    this.activities = new Map();
    this.collections = new Map();
    this.collectionBookmarks = new Map();
    this.tags = new Map();
    this.bookmarkTags = new Map();
    this.chatSessions = new Map();
    this.chatMessages = new Map();
    this.settings = new Map();
    this.reports = new Map();
    this.reportBookmarks = new Map();
    this.xCredentials = new Map();
    this.xFolders = new Map();
  }
  
  // User methods
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      user => user.username.toLowerCase() === username.toLowerCase()
    );
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newUser: User = {
      ...user,
      id,
      created_at: now,
      updated_at: now,
    };
    
    this.users.set(id, newUser);
    return newUser;
  }
  
  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { 
      ...user, 
      ...userUpdate,
      updated_at: new Date()
    };
    
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
  
  // Collection methods
  async getCollections(userId?: string): Promise<Collection[]> {
    if (userId) {
      return Array.from(this.collections.values()).filter(
        collection => collection.user_id === userId
      );
    }
    return Array.from(this.collections.values());
  }
  
  async getPublicCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values()).filter(
      collection => collection.is_public
    );
  }
  
  async getCollection(id: string): Promise<Collection | undefined> {
    return this.collections.get(id);
  }
  
  async createCollection(collection: InsertCollection): Promise<Collection> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newCollection: Collection = {
      ...collection,
      id,
      created_at: now,
      updated_at: now,
    };
    
    this.collections.set(id, newCollection);
    return newCollection;
  }
  
  async updateCollection(id: string, collectionUpdate: Partial<InsertCollection>): Promise<Collection | undefined> {
    const collection = this.collections.get(id);
    if (!collection) return undefined;
    
    const updatedCollection = {
      ...collection,
      ...collectionUpdate,
      updated_at: new Date(),
    };
    
    this.collections.set(id, updatedCollection);
    return updatedCollection;
  }
  
  async deleteCollection(id: string): Promise<boolean> {
    try {
      // First, update any X.com folder mappings to remove the collection reference
      for (const folder of this.xFolders.values()) {
        if (folder.collection_id === id) {
          folder.collection_id = null;
          folder.updated_at = new Date();
        }
      }
      
      // Then remove bookmark-collection associations (but NOT the bookmarks themselves)
      // This just deletes the relationship records in collectionBookmarks table
      for (const cb of this.collectionBookmarks.values()) {
        if (cb.collection_id === id) {
          this.collectionBookmarks.delete(cb.id);
        }
      }
      
      // Finally delete the collection itself
      return this.collections.delete(id);
    } catch (error) {
      console.error(`Error deleting collection ${id}:`, error);
      throw error;
    }
  }
  
  // Collection Bookmarks methods
  async getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]> {
    const collectionBookmarksEntries = Array.from(this.collectionBookmarks.values())
      .filter(cb => cb.collection_id === collectionId);
    
    const bookmarkIds = collectionBookmarksEntries.map(cb => cb.bookmark_id);
    return bookmarkIds.map(id => this.bookmarks.get(id)!).filter(Boolean);
  }
  
  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const collectionBookmarksEntries = Array.from(this.collectionBookmarks.values())
      .filter(cb => cb.bookmark_id === bookmarkId);
    
    const collectionIds = collectionBookmarksEntries.map(cb => cb.collection_id);
    return collectionIds.map(id => this.collections.get(id)!).filter(Boolean);
  }
  
  async addBookmarkToCollection(collectionId: string, bookmarkId: string): Promise<CollectionBookmark> {
    const id = crypto.randomUUID();
    
    const newCollectionBookmark: CollectionBookmark = {
      id,
      collection_id: collectionId,
      bookmark_id: bookmarkId,
    };
    
    this.collectionBookmarks.set(id, newCollectionBookmark);
    return newCollectionBookmark;
  }
  
  async removeBookmarkFromCollection(collectionId: string, bookmarkId: string): Promise<boolean> {
    const collectionBookmark = Array.from(this.collectionBookmarks.values())
      .find(cb => cb.collection_id === collectionId && cb.bookmark_id === bookmarkId);
    
    if (!collectionBookmark) return false;
    
    return this.collectionBookmarks.delete(collectionBookmark.id);
  }

  // Bookmarks
  async getBookmarks(userId?: string): Promise<Bookmark[]> {
    if (userId) {
      return Array.from(this.bookmarks.values()).filter(
        bookmark => bookmark.user_id === userId
      );
    }
    return Array.from(this.bookmarks.values());
  }
  
  async getBookmark(id: string): Promise<Bookmark | undefined> {
    const bookmark = this.bookmarks.get(id);
    if (!bookmark) return undefined;
    
    // Fetch related data
    const bookmarkNotes = await this.getNotesByBookmarkId(id);
    const bookmarkHighlights = await this.getHighlightsByBookmarkId(id);
    const bookmarkScreenshots = await this.getScreenshotsByBookmarkId(id);
    const bookmarkInsight = await this.getInsightByBookmarkId(id);
    
    return {
      ...bookmark,
      notes: bookmarkNotes,
      highlights: bookmarkHighlights,
      screenshots: bookmarkScreenshots,
      insights: bookmarkInsight,
    };
  }
  
  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    const id = crypto.randomUUID();
    // Convert string date to Date object if needed
    const dateSaved = bookmark.date_saved ? 
      (typeof bookmark.date_saved === 'string' ? new Date(bookmark.date_saved) : bookmark.date_saved) : 
      new Date();
    
    const newBookmark: Bookmark = {
      ...bookmark,
      id,
      date_saved: dateSaved,
      vector_embedding: null, // Add this field to satisfy TypeScript
    };
    
    this.bookmarks.set(id, newBookmark);
    return newBookmark;
  }
  
  async updateBookmark(id: string, bookmarkUpdate: Partial<InsertBookmark>): Promise<Bookmark | undefined> {
    const bookmark = this.bookmarks.get(id);
    if (!bookmark) return undefined;
    
    const updatedBookmark = { 
      ...bookmark, 
      ...bookmarkUpdate,
      updated_at: new Date()
    };
    this.bookmarks.set(id, updatedBookmark);
    return updatedBookmark;
  }
  
  async deleteBookmark(id: string): Promise<boolean> {
    return this.bookmarks.delete(id);
  }
  
  // Notes
  async getNotesByBookmarkId(bookmarkId: string): Promise<Note[]> {
    return Array.from(this.notes.values()).filter(note => note.bookmark_id === bookmarkId);
  }
  
  async createNote(note: InsertNote): Promise<Note> {
    const id = crypto.randomUUID();
    // Convert string date to Date object if needed
    const timestamp = note.timestamp ? 
      (typeof note.timestamp === 'string' ? new Date(note.timestamp) : note.timestamp) : 
      new Date();
      
    const newNote: Note = {
      ...note,
      id,
      timestamp: timestamp,
    };
    
    this.notes.set(id, newNote);
    return newNote;
  }
  
  async deleteNote(id: string): Promise<boolean> {
    return this.notes.delete(id);
  }
  
  // Screenshots
  async getScreenshotsByBookmarkId(bookmarkId: string): Promise<Screenshot[]> {
    return Array.from(this.screenshots.values()).filter(
      screenshot => screenshot.bookmark_id === bookmarkId
    );
  }
  
  async createScreenshot(screenshot: InsertScreenshot): Promise<Screenshot> {
    const id = crypto.randomUUID();
    // Convert string date to Date object if needed
    const uploadedAt = screenshot.uploaded_at ? 
      (typeof screenshot.uploaded_at === 'string' ? new Date(screenshot.uploaded_at) : screenshot.uploaded_at) : 
      new Date();
      
    const newScreenshot: Screenshot = {
      ...screenshot,
      id,
      uploaded_at: uploadedAt,
    };
    
    this.screenshots.set(id, newScreenshot);
    return newScreenshot;
  }
  
  async deleteScreenshot(id: string): Promise<boolean> {
    return this.screenshots.delete(id);
  }
  
  // Highlights
  async getHighlightsByBookmarkId(bookmarkId: string): Promise<Highlight[]> {
    return Array.from(this.highlights.values()).filter(
      highlight => highlight.bookmark_id === bookmarkId
    );
  }
  
  async createHighlight(highlight: InsertHighlight): Promise<Highlight> {
    const id = crypto.randomUUID();
    // Ensure position_selector is provided
    const newHighlight: Highlight = {
      ...highlight,
      id,
      position_selector: highlight.position_selector || null,
    };
    
    this.highlights.set(id, newHighlight);
    return newHighlight;
  }
  
  async deleteHighlight(id: string): Promise<boolean> {
    return this.highlights.delete(id);
  }
  
  // Insights
  async getInsightByBookmarkId(bookmarkId: string): Promise<Insight | undefined> {
    return Array.from(this.insights.values()).find(
      insight => insight.bookmark_id === bookmarkId
    );
  }
  
  async createInsight(insight: InsertInsight): Promise<Insight> {
    const id = crypto.randomUUID();
    const newInsight: Insight = {
      ...insight,
      id,
      summary: insight.summary || null,
      sentiment: insight.sentiment || null,
      depth_level: insight.depth_level || 1,
      related_links: insight.related_links || [],
    };
    
    this.insights.set(id, newInsight);
    return newInsight;
  }
  
  async updateInsight(id: string, insightUpdate: Partial<InsertInsight>): Promise<Insight | undefined> {
    const insight = this.insights.get(id);
    if (!insight) return undefined;
    
    const updatedInsight = { ...insight, ...insightUpdate };
    this.insights.set(id, updatedInsight);
    return updatedInsight;
  }
  
  // Activities
  async getActivities(): Promise<Activity[]> {
    return Array.from(this.activities.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = crypto.randomUUID();
    const newActivity: Activity = {
      ...activity,
      id,
      user_id: activity.user_id || null, // Make sure user_id is included
      timestamp: activity.timestamp || new Date().toISOString(),
      tags: activity.tags || [],
    };
    
    this.activities.set(id, newActivity);
    return newActivity;
  }
  
  // Tags
  async getTags(userId?: string): Promise<Tag[]> {
    // For the main tag filtering in the UI, we want to return tags that are
    // associated with bookmarks visible to the user
    if (userId) {
      // First get all user's bookmarks 
      const userBookmarks = Array.from(this.bookmarks.values())
        .filter(bookmark => bookmark.user_id === userId);
      
      if (userBookmarks.length === 0) {
        // User has no bookmarks, return empty array of tags
        return [];
      }
      
      // Get bookmark IDs
      const userBookmarkIds = userBookmarks.map(bookmark => bookmark.id);
      
      // Get all bookmark-tag relationships for these bookmarks
      const bookmarkTagEntries = Array.from(this.bookmarkTags.values())
        .filter(bt => userBookmarkIds.includes(bt.bookmark_id));
      
      if (bookmarkTagEntries.length === 0) {
        // No tag relationships found for user's bookmarks
        return [];
      }
      
      // Get the unique tag IDs
      const tagIds = [...new Set(bookmarkTagEntries.map(bt => bt.tag_id))];
      
      // Return only tags associated with user's bookmarks
      return Array.from(this.tags.values())
        .filter(tag => tagIds.includes(tag.id));
    }
    
    // If no userId provided (user not logged in), still return tags associated with bookmarks
    // Get all tag IDs from bookmark_tags relationships
    const allBookmarkTagEntries = Array.from(this.bookmarkTags.values());
    const allTagIds = [...new Set(allBookmarkTagEntries.map(bt => bt.tag_id))];
    
    // Return only tags that are associated with bookmarks
    return Array.from(this.tags.values())
      .filter(tag => allTagIds.includes(tag.id));
  }
  
  async getTag(id: string): Promise<Tag | undefined> {
    return this.tags.get(id);
  }
  
  async getTagByName(name: string): Promise<Tag | undefined> {
    if (!name) return undefined;
    
    // Use case-insensitive comparison
    return Array.from(this.tags.values()).find(
      tag => tag.name.toLowerCase() === name.toLowerCase()
    );
  }
  
  async createTag(tag: InsertTag): Promise<Tag> {
    const id = crypto.randomUUID();
    const created_at = new Date();
    
    // Ensure type is always a valid value
    const type = tag.type && (tag.type === "user" || tag.type === "system") 
                 ? tag.type 
                 : "user";
    
    const newTag: Tag = {
      id,
      name: tag.name,
      type, // Use our validated type
      count: 0,
      created_at,
    };
    
    this.tags.set(id, newTag);
    return newTag;
  }
  
  async updateTag(id: string, tagUpdate: Partial<InsertTag>): Promise<Tag | undefined> {
    const tag = this.tags.get(id);
    if (!tag) return undefined;
    
    const updatedTag = { ...tag, ...tagUpdate };
    this.tags.set(id, updatedTag);
    return updatedTag;
  }
  
  async incrementTagCount(id: string): Promise<Tag | undefined> {
    const tag = this.tags.get(id);
    if (!tag) return undefined;
    
    const updatedTag = { ...tag, count: tag.count + 1 };
    this.tags.set(id, updatedTag);
    return updatedTag;
  }
  
  async decrementTagCount(id: string): Promise<Tag | undefined> {
    const tag = this.tags.get(id);
    if (!tag) return undefined;
    
    const updatedTag = { ...tag, count: Math.max(0, tag.count - 1) };
    this.tags.set(id, updatedTag);
    return updatedTag;
  }
  
  async deleteTag(id: string): Promise<boolean> {
    return this.tags.delete(id);
  }
  
  // BookmarkTags
  async getTagsByBookmarkId(bookmarkId: string): Promise<Tag[]> {
    const bookmarkTagsEntries = Array.from(this.bookmarkTags.values())
      .filter(bt => bt.bookmark_id === bookmarkId);
    
    const tagIds = bookmarkTagsEntries.map(bt => bt.tag_id);
    return tagIds.map(id => this.tags.get(id)!).filter(Boolean);
  }
  
  async getAllBookmarkTags(bookmarkIds?: string[]): Promise<{[bookmarkId: string]: Tag[]}> {
    // Create a map to store tags for each bookmark
    const bookmarkTagsMap: {[bookmarkId: string]: Tag[]} = {};
    
    // Get all bookmark-tag relationships, filtering by bookmark IDs if provided
    const filteredBookmarkTags = Array.from(this.bookmarkTags.values()).filter(bt => {
      if (bookmarkIds && bookmarkIds.length > 0) {
        return bookmarkIds.includes(bt.bookmark_id);
      }
      return true;
    });
    
    // Group tags by bookmark ID
    for (const bt of filteredBookmarkTags) {
      const tag = this.tags.get(bt.tag_id);
      if (!tag) continue;
      
      if (!bookmarkTagsMap[bt.bookmark_id]) {
        bookmarkTagsMap[bt.bookmark_id] = [];
      }
      
      bookmarkTagsMap[bt.bookmark_id].push(tag);
    }
    
    return bookmarkTagsMap;
  }
  
  async getBookmarksByTagId(tagId: string): Promise<Bookmark[]> {
    const bookmarkTagsEntries = Array.from(this.bookmarkTags.values())
      .filter(bt => bt.tag_id === tagId);
    
    const bookmarkIds = bookmarkTagsEntries.map(bt => bt.bookmark_id);
    return bookmarkIds.map(id => this.bookmarks.get(id)!).filter(Boolean);
  }
  
  async addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag> {
    const id = crypto.randomUUID();
    
    const newBookmarkTag: BookmarkTag = {
      id,
      bookmark_id: bookmarkId,
      tag_id: tagId,
    };
    
    this.bookmarkTags.set(id, newBookmarkTag);
    
    // Increment the tag count
    await this.incrementTagCount(tagId);
    
    return newBookmarkTag;
  }
  
  async removeTagFromBookmark(bookmarkId: string, tagId: string): Promise<boolean> {
    const bookmarkTag = Array.from(this.bookmarkTags.values())
      .find(bt => bt.bookmark_id === bookmarkId && bt.tag_id === tagId);
    
    if (!bookmarkTag) return false;
    
    const result = this.bookmarkTags.delete(bookmarkTag.id);
    
    if (result) {
      // Decrement the tag count
      await this.decrementTagCount(tagId);
    }
    
    return result;
  }
  
  // Chat Sessions
  async getChatSessions(userId?: string): Promise<ChatSession[]> {
    if (userId) {
      return Array.from(this.chatSessions.values())
        .filter(session => session.user_id === userId)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    return Array.from(this.chatSessions.values())
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    return this.chatSessions.get(id);
  }

  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newSession: ChatSession = {
      ...session,
      id,
      created_at: now,
      updated_at: now,
      filters: session.filters || null,
      user_id: session.user_id || null,
    };
    
    this.chatSessions.set(id, newSession);
    return newSession;
  }

  async updateChatSession(id: string, sessionUpdate: Partial<InsertChatSession>): Promise<ChatSession | undefined> {
    const session = this.chatSessions.get(id);
    if (!session) return undefined;
    
    const updatedSession: ChatSession = {
      ...session,
      ...sessionUpdate,
      updated_at: new Date(),
    };
    
    this.chatSessions.set(id, updatedSession);
    return updatedSession;
  }

  async deleteChatSession(id: string): Promise<boolean> {
    // Delete all messages in the session first
    await this.deleteChatMessagesBySessionId(id);
    
    // Then delete the session itself
    return this.chatSessions.delete(id);
  }
  
  // Chat Messages
  async getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(message => message.session_id === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newMessage: ChatMessage = {
      ...message,
      id,
      timestamp: now,
    };
    
    this.chatMessages.set(id, newMessage);
    
    // Update the parent session's updated_at timestamp
    await this.updateChatSession(message.session_id, {});
    
    return newMessage;
  }

  async deleteChatMessagesBySessionId(sessionId: string): Promise<boolean> {
    const messagesToDelete = Array.from(this.chatMessages.values())
      .filter(message => message.session_id === sessionId);
    
    if (messagesToDelete.length === 0) return false;
    
    let allDeleted = true;
    for (const message of messagesToDelete) {
      if (!this.chatMessages.delete(message.id)) {
        allDeleted = false;
      }
    }
    
    return allDeleted;
  }
  
  // Settings
  async getSettings(userId?: string): Promise<Setting[]> {
    if (userId) {
      return Array.from(this.settings.values())
        .filter(setting => setting.user_id === userId);
    }
    return Array.from(this.settings.values());
  }
  
  async getSetting(key: string): Promise<Setting | undefined> {
    // Find setting by key (case-sensitive match)
    return Array.from(this.settings.values()).find(setting => setting.key === key);
  }
  
  async createSetting(setting: InsertSetting): Promise<Setting> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    // Create the new setting
    const newSetting: Setting = {
      id,
      key: setting.key,
      value: setting.value,
      description: setting.description || null,
      user_id: setting.user_id || null, // Make sure user_id is included
      updated_at: now
    };
    
    // Save by ID for consistency, but also get by key
    this.settings.set(id, newSetting);
    return newSetting;
  }
  
  async updateSetting(key: string, value: string): Promise<Setting | undefined> {
    // Find the setting by key
    const setting = Array.from(this.settings.values()).find(setting => setting.key === key);
    if (!setting) return undefined;
    
    // Update the setting
    const updatedSetting: Setting = {
      ...setting,
      value,
      updated_at: new Date()
    };
    
    // Update in map
    this.settings.set(setting.id, updatedSetting);
    return updatedSetting;
  }
  
  async deleteSetting(key: string): Promise<boolean> {
    // Find the setting by key
    const setting = Array.from(this.settings.values()).find(setting => setting.key === key);
    if (!setting) return false;
    
    // Delete the setting
    return this.settings.delete(setting.id);
  }
  
  // X.com integration methods
  async createXCredentials(credentials: InsertXCredentials): Promise<XCredentials> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newCredentials: XCredentials = {
      ...credentials,
      id,
      created_at: now,
      updated_at: now,
      last_sync_at: null
    };
    
    this.xCredentials.set(id, newCredentials);
    return newCredentials;
  }
  
  async getXCredentialsByUserId(userId: string): Promise<XCredentials | undefined> {
    return Array.from(this.xCredentials.values()).find(
      credentials => credentials.user_id === userId
    );
  }
  
  async updateXCredentials(id: string, credentialsUpdate: Partial<XCredentials>): Promise<XCredentials | undefined> {
    const credentials = this.xCredentials.get(id);
    if (!credentials) return undefined;
    
    const updatedCredentials: XCredentials = {
      ...credentials,
      ...credentialsUpdate,
      updated_at: new Date()
    };
    
    this.xCredentials.set(id, updatedCredentials);
    return updatedCredentials;
  }
  
  async createXFolder(folder: InsertXFolder): Promise<XFolder> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newFolder: XFolder = {
      ...folder,
      id,
      created_at: now,
      updated_at: now,
      last_sync_at: now
    };
    
    this.xFolders.set(id, newFolder);
    return newFolder;
  }
  
  async getXFoldersByUserId(userId: string): Promise<XFolder[]> {
    return Array.from(this.xFolders.values()).filter(
      folder => folder.user_id === userId
    );
  }
  
  async getStoredXFolders(userId: string): Promise<XFolder[]> {
    // For memory storage, this is the same as getXFoldersByUserId
    return this.getXFoldersByUserId(userId);
  }
  
  async updateXFolder(id: string, folderUpdate: Partial<XFolder>): Promise<XFolder | undefined> {
    const folder = this.xFolders.get(id);
    if (!folder) return undefined;
    
    const updatedFolder: XFolder = {
      ...folder,
      ...folderUpdate,
      updated_at: new Date()
    };
    
    this.xFolders.set(id, updatedFolder);
    return updatedFolder;
  }
  
  async updateXFolderLastSync(id: string): Promise<XFolder | undefined> {
    const folder = this.xFolders.get(id);
    if (!folder) return undefined;
    
    const updatedFolder: XFolder = {
      ...folder,
      last_sync_at: new Date(),
      updated_at: new Date()
    };
    
    this.xFolders.set(id, updatedFolder);
    return updatedFolder;
  }
  
  async findBookmarkByExternalId(userId: string, externalId: string, source: string): Promise<Bookmark | undefined> {
    return Array.from(this.bookmarks.values()).find(
      bookmark => 
        bookmark.user_id === userId && 
        bookmark.external_id === externalId &&
        bookmark.source === source
    );
  }
}

// PostgreSQL database storage implementation
export class DatabaseStorage implements IStorage {
  // Database access - provide raw access to the database for direct queries
  getDb(): typeof db {
    return db;
  }
  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db
      .insert(users)
      .values(user)
      .returning();
    return newUser;
  }
  
  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...userUpdate, updated_at: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }
  
  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
  
  // Email verification methods
  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verification_token, token));
    return user || undefined;
  }
  
  async setVerificationToken(userId: string, token: string, expiresIn: number): Promise<boolean> {
    // Calculate expiration date (current time + expiresIn in milliseconds)
    const expires = new Date(Date.now() + expiresIn);
    
    const [updatedUser] = await db
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
      const [updatedUser] = await db
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
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.reset_token, token));
    return user || undefined;
  }
  
  async setResetToken(userId: string, token: string, expiresIn: number): Promise<boolean> {
    // Calculate expiration date (current time + expiresIn in milliseconds)
    const expires = new Date(Date.now() + expiresIn);
    
    const [updatedUser] = await db
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
    const [updatedUser] = await db
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
      return await db.select().from(collections).where(eq(collections.user_id, userId));
    }
    return await db.select().from(collections);
  }
  
  async getPublicCollections(): Promise<Collection[]> {
    return await db.select().from(collections).where(eq(collections.is_public, true));
  }
  
  async getCollection(id: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.id, id));
    return collection || undefined;
  }
  
  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [newCollection] = await db
      .insert(collections)
      .values(collection)
      .returning();
    return newCollection;
  }
  
  async updateCollection(id: string, collectionUpdate: Partial<InsertCollection>): Promise<Collection | undefined> {
    const [updatedCollection] = await db
      .update(collections)
      .set({ ...collectionUpdate, updated_at: new Date() })
      .where(eq(collections.id, id))
      .returning();
    return updatedCollection || undefined;
  }
  
  async deleteCollection(id: string): Promise<boolean> {
    try {
      // First, remove any X.com folder mappings to this collection
      await db.update(xFolders)
        .set({ 
          collection_id: null,
          updated_at: new Date()
        })
        .where(eq(xFolders.collection_id, id));
      
      // Then remove bookmark-collection associations (but NOT the bookmarks themselves)
      // This just deletes the relationship records in collectionBookmarks table
      await db.delete(collectionBookmarks)
        .where(eq(collectionBookmarks.collection_id, id));
      
      // Finally delete the collection itself
      const result = await db.delete(collections)
        .where(eq(collections.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error(`Error deleting collection ${id}:`, error);
      throw error;
    }
  }
  
  // Collection Bookmarks
  async getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]> {
    const result = await db
      .select({
        bookmark: bookmarks
      })
      .from(collectionBookmarks)
      .innerJoin(bookmarks, eq(collectionBookmarks.bookmark_id, bookmarks.id))
      .where(eq(collectionBookmarks.collection_id, collectionId));
    
    return result.map(r => r.bookmark);
  }
  
  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const result = await db
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
      const existingRelation = await db
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
      const [newCollectionBookmark] = await db
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
        const [existingRecord] = await db
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
      const result = await db
        .delete(collectionBookmarks)
        .where(eq(collectionBookmarks.collection_id, collectionId))
        .where(eq(collectionBookmarks.bookmark_id, bookmarkId))
        .returning();
      
      console.log(`Removed bookmark ${bookmarkId} from collection ${collectionId}: ${result.length > 0}`);
      return result.length > 0;
    } catch (error) {
      console.error(`Database error removing bookmark ${bookmarkId} from collection ${collectionId}:`, error);
      throw error;
    }
  }
  
  // Bookmarks
  async getBookmarks(userId?: string): Promise<Bookmark[]> {
    if (userId) {
      return await db.select().from(bookmarks).where(eq(bookmarks.user_id, userId));
    }
    return await db.select().from(bookmarks);
  }
  
  async getBookmark(id: string): Promise<Bookmark | undefined> {
    const [bookmark] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
    
    if (!bookmark) return undefined;
    
    // Fetch related data
    const bookmarkNotes = await this.getNotesByBookmarkId(id);
    const bookmarkHighlights = await this.getHighlightsByBookmarkId(id);
    const bookmarkScreenshots = await this.getScreenshotsByBookmarkId(id);
    const bookmarkInsight = await this.getInsightByBookmarkId(id);
    
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
    
    const [newBookmark] = await db.insert(bookmarks).values(bookmarkData).returning();
    return newBookmark;
  }
  
  async updateBookmark(id: string, bookmarkUpdate: Partial<InsertBookmark>): Promise<Bookmark | undefined> {
    const [updatedBookmark] = await db
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
    const result = await db.delete(bookmarks).where(eq(bookmarks.id, id)).returning({ id: bookmarks.id });
    return result.length > 0;
  }
  
  // Notes
  async getNotesByBookmarkId(bookmarkId: string): Promise<Note[]> {
    return await db.select().from(notes).where(eq(notes.bookmark_id, bookmarkId));
  }
  
  async createNote(note: InsertNote): Promise<Note> {
    // Ensure timestamp is a Date object
    const noteData = {
      ...note,
      timestamp: new Date()
    };
    
    const [newNote] = await db.insert(notes).values(noteData).returning();
    return newNote;
  }
  
  async deleteNote(id: string): Promise<boolean> {
    const result = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    return result.length > 0;
  }
  
  // Screenshots
  async getScreenshotsByBookmarkId(bookmarkId: string): Promise<Screenshot[]> {
    return await db.select().from(screenshots).where(eq(screenshots.bookmark_id, bookmarkId));
  }
  
  async createScreenshot(screenshot: InsertScreenshot): Promise<Screenshot> {
    // Ensure uploaded_at is a Date object
    const screenshotData = {
      ...screenshot,
      uploaded_at: new Date()
    };
    
    const [newScreenshot] = await db.insert(screenshots).values(screenshotData).returning();
    return newScreenshot;
  }
  
  async deleteScreenshot(id: string): Promise<boolean> {
    const result = await db.delete(screenshots).where(eq(screenshots.id, id)).returning({ id: screenshots.id });
    return result.length > 0;
  }
  
  // Highlights
  async getHighlightsByBookmarkId(bookmarkId: string): Promise<Highlight[]> {
    return await db.select().from(highlights).where(eq(highlights.bookmark_id, bookmarkId));
  }
  
  async createHighlight(highlight: InsertHighlight): Promise<Highlight> {
    const [newHighlight] = await db.insert(highlights).values(highlight).returning();
    return newHighlight;
  }
  
  async deleteHighlight(id: string): Promise<boolean> {
    const result = await db.delete(highlights).where(eq(highlights.id, id)).returning({ id: highlights.id });
    return result.length > 0;
  }
  
  // Insights
  async getInsightByBookmarkId(bookmarkId: string): Promise<Insight | undefined> {
    const [insight] = await db.select().from(insights).where(eq(insights.bookmark_id, bookmarkId));
    return insight;
  }
  
  async createInsight(insight: InsertInsight): Promise<Insight> {
    const [newInsight] = await db.insert(insights).values(insight).returning();
    return newInsight;
  }
  
  async updateInsight(id: string, insightUpdate: Partial<InsertInsight>): Promise<Insight | undefined> {
    const [updatedInsight] = await db
      .update(insights)
      .set(insightUpdate)
      .where(eq(insights.id, id))
      .returning();
    
    return updatedInsight;
  }
  
  // Activities
  async getActivities(userId?: string, limit?: number): Promise<Activity[]> {
    if (userId) {
      // If a user is authenticated, return all their activities
      return await db
        .select()
        .from(activities)
        .where(eq(activities.user_id, userId))
        .orderBy(desc(activities.timestamp));
    }
    
    // For non-authenticated users, optionally limit the number of activities returned
    let query = db.select().from(activities).orderBy(desc(activities.timestamp));
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query;
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    // Ensure timestamp is a Date object
    const activityData = {
      ...activity,
      user_id: activity.user_id || null, // Make sure user_id is included
      timestamp: new Date()
    };
    
    const [newActivity] = await db.insert(activities).values(activityData).returning();
    return newActivity;
  }
  
  // Tags
  async getTags(userId?: string): Promise<Tag[]> {
    // For the main tag filtering in the UI, we want to return tags that are
    // associated with bookmarks visible to the user
    if (userId) {
      // Use direct SQL join to get tags associated with user's bookmarks
      // This is more efficient than the previous implementation
      const userTags = await db
        .select({
          tag: tags
        })
        .from(tags)
        .innerJoin(bookmarkTags, eq(bookmarkTags.tag_id, tags.id))
        .innerJoin(bookmarks, eq(bookmarkTags.bookmark_id, bookmarks.id))
        .where(eq(bookmarks.user_id, userId))
        .groupBy(tags.id); // Group by tag ID to eliminate duplicates
      
      // If no results, return empty array
      if (userTags.length === 0) {
        return [];
      }
      
      // Extract tag objects from the join result
      return userTags.map(result => result.tag);
    }
    
    // If no userId provided (user not logged in), return distinct tags for all bookmarks
    // This ensures non-authenticated users still see relevant tags for filtering
    // Using SQL GROUP BY to ensure we only get unique tags
    const allTags = await db
      .select({
        tag: tags
      })
      .from(tags)
      .innerJoin(bookmarkTags, eq(bookmarkTags.tag_id, tags.id))
      .groupBy(tags.id); // Group by tag ID to eliminate duplicates
    
    // Extract tag objects from the join result
    return allTags.map(result => result.tag);
  }
  
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }
  
  async getTagByName(name: string): Promise<Tag | undefined> {
    if (!name) return undefined;
    
    // Use SQL LOWER function for case-insensitive comparison
    const [tag] = await db
      .select()
      .from(tags)
      .where(sql`LOWER(${tags.name}) = LOWER(${name})`);
    
    return tag;
  }
  
  async createTag(tag: InsertTag): Promise<Tag> {
    const [newTag] = await db.insert(tags).values(tag).returning();
    return newTag;
  }
  
  async updateTag(id: string, tagUpdate: Partial<InsertTag>): Promise<Tag | undefined> {
    const [updatedTag] = await db
      .update(tags)
      .set(tagUpdate)
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async incrementTagCount(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    if (!tag) return undefined;
    
    const [updatedTag] = await db
      .update(tags)
      .set({ count: tag.count + 1 })
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async decrementTagCount(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    if (!tag) return undefined;
    
    const [updatedTag] = await db
      .update(tags)
      .set({ count: Math.max(0, tag.count - 1) })
      .where(eq(tags.id, id))
      .returning();
    
    return updatedTag;
  }
  
  async deleteTag(id: string): Promise<boolean> {
    const result = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
    return result.length > 0;
  }
  
  // BookmarkTags
  async getTagsByBookmarkId(bookmarkId: string): Promise<Tag[]> {
    // Get tags from the normalized system
    const joinResult = await db
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
    let query = db
      .select({
        bookmarkId: bookmarkTags.bookmark_id,
        tag: tags
      })
      .from(bookmarkTags)
      .innerJoin(tags, eq(bookmarkTags.tag_id, tags.id));
    
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
    const joinResult = await db
      .select({
        bookmark: bookmarks
      })
      .from(bookmarkTags)
      .innerJoin(bookmarks, eq(bookmarkTags.bookmark_id, bookmarks.id))
      .where(eq(bookmarkTags.tag_id, tagId));
    
    return joinResult.map(result => result.bookmark);
  }
  
  async addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag> {
    const [newBookmarkTag] = await db
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
      const result = await db
        .delete(bookmarkTags)
        .where(eq(bookmarkTags.bookmark_id, bookmarkId))
        .where(eq(bookmarkTags.tag_id, tagId))
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
      return await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.user_id, userId))
        .orderBy(desc(chatSessions.updated_at));
    }
    return await db
      .select()
      .from(chatSessions)
      .orderBy(desc(chatSessions.updated_at));
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db
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
    
    const [newSession] = await db
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

    const [updatedSession] = await db
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
    const result = await db
      .delete(chatSessions)
      .where(eq(chatSessions.id, id))
      .returning({ id: chatSessions.id });
    
    return result.length > 0;
  }
  
  // Chat Messages
  async getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
    return await db
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
    
    const [newMessage] = await db
      .insert(chatMessages)
      .values(messageData)
      .returning();
    
    // Update the parent session's updated_at timestamp
    await this.updateChatSession(message.session_id, {});
    
    return newMessage;
  }

  async deleteChatMessagesBySessionId(sessionId: string): Promise<boolean> {
    const result = await db
      .delete(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .returning({ id: chatMessages.id });
    
    return result.length > 0;
  }
  
  // Settings
  async getSettings(userId?: string): Promise<Setting[]> {
    if (userId) {
      return await db
        .select()
        .from(settings)
        .where(eq(settings.user_id, userId))
        .orderBy(settings.key);
    }
    return await db
      .select()
      .from(settings)
      .orderBy(settings.key);
  }
  
  async getSetting(key: string): Promise<Setting | undefined> {
    const result = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    
    return result[0];
  }
  
  async createSetting(setting: InsertSetting): Promise<Setting> {
    const [newSetting] = await db
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
    const result = await db
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
    const result = await db
      .delete(settings)
      .where(eq(settings.key, key))
      .returning({ id: settings.id });
    
    return result.length > 0;
  }
  
  // X.com integration
  async createXCredentials(credentials: InsertXCredentials): Promise<XCredentials> {
    const [newCredentials] = await db.insert(xCredentials)
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
    const [credentials] = await db.select()
      .from(xCredentials)
      .where(eq(xCredentials.user_id, userId));
    return credentials;
  }
  
  async updateXCredentials(id: string, credentialsUpdate: Partial<XCredentials>): Promise<XCredentials | undefined> {
    const [updatedCredentials] = await db.update(xCredentials)
      .set({
        ...credentialsUpdate,
        updated_at: new Date()
      })
      .where(eq(xCredentials.id, id))
      .returning();
    return updatedCredentials;
  }
  
  async createXFolder(folder: InsertXFolder): Promise<XFolder> {
    const [newFolder] = await db.insert(xFolders)
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
    return await db.select()
      .from(xFolders)
      .where(eq(xFolders.user_id, userId));
  }
  
  async updateXFolderLastSync(id: string): Promise<XFolder | undefined> {
    const [updatedFolder] = await db.update(xFolders)
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
    return await db.select()
      .from(xFolders)
      .where(eq(xFolders.user_id, userId));
  }
  
  async updateXFolder(id: string, folderUpdate: Partial<XFolder>): Promise<XFolder | undefined> {
    console.log(`DB: Updating X folder ${id}`);
    const [updatedFolder] = await db.update(xFolders)
      .set({
        ...folderUpdate,
        updated_at: new Date()
      })
      .where(eq(xFolders.id, id))
      .returning();
    return updatedFolder;
  }
  
  async findBookmarkByExternalId(userId: string, externalId: string, source: string): Promise<Bookmark | undefined> {
    const [bookmark] = await db.select()
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
    const userReports = await db.select()
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
    const [report] = await db.select()
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
    const [newReport] = await db.insert(reports)
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
    const [updatedReport] = await db.update(reports)
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
    const [updatedReport] = await db.update(reports)
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
    await db.delete(reportBookmarks)
      .where(eq(reportBookmarks.report_id, id));
    
    // Then delete the report
    const result = await db.delete(reports)
      .where(eq(reports.id, id))
      .returning();
    return result.length > 0;
  }
  
  // Report Bookmarks methods
  async getReportBookmarks(reportId: string): Promise<ReportBookmark[]> {
    return await db.select()
      .from(reportBookmarks)
      .where(eq(reportBookmarks.report_id, reportId));
  }
  
  async getBookmarksByReportId(reportId: string): Promise<Bookmark[]> {
    const reportBookmarkRows = await db.select({
      bookmarkId: reportBookmarks.bookmark_id
    })
    .from(reportBookmarks)
    .where(eq(reportBookmarks.report_id, reportId));
    
    const bookmarkIds = reportBookmarkRows.map(row => row.bookmarkId);
    
    if (bookmarkIds.length === 0) {
      return [];
    }
    
    return await db.select()
      .from(bookmarks)
      .where(inArray(bookmarks.id, bookmarkIds));
  }
  
  async getBookmarksWithInsightsAndTags(userId: string, since: Date, limit?: number): Promise<{
    bookmark: Bookmark;
    insight?: Insight;
    tags: Tag[];
  }[]> {
    // 1. Get recent bookmarks first
    let bookmarksQuery = db.select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.user_id, userId),
          sql`${bookmarks.date_saved} >= ${since}`
        )
      )
      .orderBy(desc(bookmarks.date_saved));
    
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
    const bookmarkInsights = await db.select()
      .from(insights)
      .where(inArray(insights.bookmark_id, bookmarkIds));
    
    // Map insights by bookmark_id for easy lookup
    const insightsByBookmarkId = new Map<string, Insight>();
    bookmarkInsights.forEach(insight => {
      insightsByBookmarkId.set(insight.bookmark_id, insight);
    });
    
    // 4. Get tags for these bookmarks
    const bookmarkTagRelations = await db.select({
      bookmarkId: bookmarkTags.bookmark_id,
      tagId: bookmarkTags.tag_id
    })
    .from(bookmarkTags)
    .where(inArray(bookmarkTags.bookmark_id, bookmarkIds));
    
    // Get all unique tag IDs
    const tagIds = Array.from(new Set(bookmarkTagRelations.map(rel => rel.tagId)));
    
    // Get all tags
    const allTags = await db.select()
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
    const [newReportBookmark] = await db.insert(reportBookmarks)
      .values({
        report_id: reportId,
        bookmark_id: bookmarkId
      })
      .returning();
    return newReportBookmark;
  }
  
  async removeBookmarkFromReport(reportId: string, bookmarkId: string): Promise<boolean> {
    const result = await db.delete(reportBookmarks)
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

// Use the database storage implementation 
export const storage = new DatabaseStorage();
