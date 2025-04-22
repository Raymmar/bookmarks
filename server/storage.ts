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
  collectionBookmarks, CollectionBookmark, InsertCollectionBookmark
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, inArray } from "drizzle-orm";

// Storage interface
export interface IStorage {
  // Database access
  getDb(): typeof db;
  
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Bookmarks
  getBookmarks(userId?: string): Promise<Bookmark[]>;
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
    return this.collections.delete(id);
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
      user_tags: bookmark.user_tags || [],
      system_tags: bookmark.system_tags || [],
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
    const result = await db.delete(collections).where(eq(collections.id, id)).returning();
    return result.length > 0;
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
    const [newCollectionBookmark] = await db
      .insert(collectionBookmarks)
      .values({
        collection_id: collectionId,
        bookmark_id: bookmarkId
      })
      .returning();
    
    return newCollectionBookmark;
  }
  
  async removeBookmarkFromCollection(collectionId: string, bookmarkId: string): Promise<boolean> {
    const result = await db
      .delete(collectionBookmarks)
      .where(
        sql`${collectionBookmarks.collection_id} = ${collectionId} AND ${collectionBookmarks.bookmark_id} = ${bookmarkId}`
      )
      .returning();
    
    return result.length > 0;
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
    const result = await db
      .delete(bookmarkTags)
      .where(
        eq(bookmarkTags.bookmark_id, bookmarkId) && 
        eq(bookmarkTags.tag_id, tagId)
      )
      .returning({ id: bookmarkTags.id });
    
    if (result.length > 0) {
      // Decrement the tag count
      await this.decrementTagCount(tagId);
      return true;
    }
    
    return false;
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
}

// Use the database storage implementation 
export const storage = new DatabaseStorage();
