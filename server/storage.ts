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
  collectionMemberships, CollectionMembership, InsertCollectionMembership,
  bookmarkCollections, BookmarkCollection, InsertBookmarkCollection
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import createMemoryStore from "memorystore";
import session from "express-session";

// Storage interface
export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Collections
  getCollections(): Promise<Collection[]>;
  getPublicCollections(): Promise<Collection[]>;
  getUserCollections(userId: string): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | undefined>;
  getDefaultCollection(userId: string): Promise<Collection | undefined>;
  createCollection(collection: InsertCollection): Promise<Collection>;
  updateCollection(id: string, collection: Partial<InsertCollection>): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<boolean>;
  
  // Collection Memberships
  getCollectionMembers(collectionId: string): Promise<User[]>;
  getUserCollectionMemberships(userId: string): Promise<CollectionMembership[]>;
  addUserToCollection(collectionId: string, userId: string, role?: "viewer" | "editor" | "admin"): Promise<CollectionMembership>;
  updateCollectionMembership(collectionId: string, userId: string, role: "viewer" | "editor" | "admin"): Promise<CollectionMembership | undefined>;
  removeUserFromCollection(collectionId: string, userId: string): Promise<boolean>;
  
  // Bookmark-Collection relationships
  getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]>;
  getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]>;
  addBookmarkToCollection(bookmarkId: string, collectionId: string): Promise<BookmarkCollection>;
  removeBookmarkFromCollection(bookmarkId: string, collectionId: string): Promise<boolean>;
  
  // Bookmarks
  getBookmarks(): Promise<Bookmark[]>;
  getBookmark(id: string): Promise<Bookmark | undefined>;
  createBookmark(bookmark: InsertBookmark): Promise<Bookmark>;
  updateBookmark(id: string, bookmark: Partial<InsertBookmark>): Promise<Bookmark | undefined>;
  deleteBookmark(id: string): Promise<boolean>;
  
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
  getTags(): Promise<Tag[]>;
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
  
  // Session store for auth
  sessionStore: any;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    // Initialize session store with PostgreSQL
    const PostgresSessionStore = connectPg(session);
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount > 0;
  }

  // Collections
  async getCollections(): Promise<Collection[]> {
    return await db.select().from(collections);
  }

  async getPublicCollections(): Promise<Collection[]> {
    return await db.select().from(collections).where(eq(collections.is_public, true));
  }

  async getUserCollections(userId: string): Promise<Collection[]> {
    return await db.select().from(collections).where(eq(collections.owner_id, userId));
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.id, id));
    return collection;
  }

  async getDefaultCollection(userId: string): Promise<Collection | undefined> {
    const [defaultCollection] = await db
      .select()
      .from(collections)
      .where(eq(collections.owner_id, userId))
      .where(eq(collections.is_default, true));
    return defaultCollection;
  }

  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [newCollection] = await db.insert(collections).values(collection).returning();
    return newCollection;
  }

  async updateCollection(id: string, updates: Partial<InsertCollection>): Promise<Collection | undefined> {
    const [updatedCollection] = await db
      .update(collections)
      .set(updates)
      .where(eq(collections.id, id))
      .returning();
    return updatedCollection;
  }

  async deleteCollection(id: string): Promise<boolean> {
    const result = await db.delete(collections).where(eq(collections.id, id));
    return result.rowCount > 0;
  }

  // Collection Memberships
  async getCollectionMembers(collectionId: string): Promise<User[]> {
    const memberships = await db
      .select()
      .from(collectionMemberships)
      .where(eq(collectionMemberships.collection_id, collectionId));
    
    const userIds = memberships.map(membership => membership.user_id);
    
    if (userIds.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(users)
      .where(sql`${users.id} IN (${userIds.join(',')})`);
  }

  async getUserCollectionMemberships(userId: string): Promise<CollectionMembership[]> {
    return await db
      .select()
      .from(collectionMemberships)
      .where(eq(collectionMemberships.user_id, userId));
  }

  async addUserToCollection(
    collectionId: string, 
    userId: string, 
    role: "viewer" | "editor" | "admin" = "viewer"
  ): Promise<CollectionMembership> {
    const [membership] = await db
      .insert(collectionMemberships)
      .values({
        id: crypto.randomUUID(),
        collection_id: collectionId,
        user_id: userId,
        role,
        created_at: new Date()
      })
      .returning();
    return membership;
  }

  async updateCollectionMembership(
    collectionId: string, 
    userId: string, 
    role: "viewer" | "editor" | "admin"
  ): Promise<CollectionMembership | undefined> {
    const [updatedMembership] = await db
      .update(collectionMemberships)
      .set({ role })
      .where(eq(collectionMemberships.collection_id, collectionId))
      .where(eq(collectionMemberships.user_id, userId))
      .returning();
    return updatedMembership;
  }

  async removeUserFromCollection(collectionId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(collectionMemberships)
      .where(eq(collectionMemberships.collection_id, collectionId))
      .where(eq(collectionMemberships.user_id, userId));
    return result.rowCount > 0;
  }

  // Bookmark-Collection relationships
  async getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]> {
    const bookmarkCollectionEntries = await db
      .select()
      .from(bookmarkCollections)
      .where(eq(bookmarkCollections.collection_id, collectionId));
    
    const bookmarkIds = bookmarkCollectionEntries.map(entry => entry.bookmark_id);
    
    if (bookmarkIds.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(bookmarks)
      .where(sql`${bookmarks.id} IN (${bookmarkIds.join(',')})`);
  }

  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const bookmarkCollectionEntries = await db
      .select()
      .from(bookmarkCollections)
      .where(eq(bookmarkCollections.bookmark_id, bookmarkId));
    
    const collectionIds = bookmarkCollectionEntries.map(entry => entry.collection_id);
    
    if (collectionIds.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(collections)
      .where(sql`${collections.id} IN (${collectionIds.join(',')})`);
  }

  async addBookmarkToCollection(bookmarkId: string, collectionId: string): Promise<BookmarkCollection> {
    const [entry] = await db
      .insert(bookmarkCollections)
      .values({
        id: crypto.randomUUID(),
        bookmark_id: bookmarkId,
        collection_id: collectionId,
        added_at: new Date()
      })
      .returning();
    return entry;
  }

  async removeBookmarkFromCollection(bookmarkId: string, collectionId: string): Promise<boolean> {
    const result = await db
      .delete(bookmarkCollections)
      .where(eq(bookmarkCollections.bookmark_id, bookmarkId))
      .where(eq(bookmarkCollections.collection_id, collectionId));
    return result.rowCount > 0;
  }

// In-memory storage implementation as a fallback
export class MemStorage implements IStorage {
  private bookmarks: Map<string, Bookmark>;
  private notes: Map<string, Note>;
  private screenshots: Map<string, Screenshot>;
  private highlights: Map<string, Highlight>;
  private insights: Map<string, Insight>;
  private activities: Map<string, Activity>;

  private tags: Map<string, Tag>;
  private bookmarkTags: Map<string, BookmarkTag>;
  
  // Chat persistence
  private chatSessions: Map<string, ChatSession>;
  private chatMessages: Map<string, ChatMessage>;
  
  // Settings
  private settings: Map<string, Setting>;
  
  // User persistence
  private users: Map<string, User>;
  
  // Collections persistence
  private collections: Map<string, Collection>;
  private collectionMemberships: Map<string, CollectionMembership>;
  private bookmarkCollections: Map<string, BookmarkCollection>;
  
  // Session store
  sessionStore: any;

  constructor() {
    this.bookmarks = new Map();
    this.notes = new Map();
    this.screenshots = new Map();
    this.highlights = new Map();
    this.insights = new Map();
    this.activities = new Map();
    this.tags = new Map();
    this.bookmarkTags = new Map();
    this.chatSessions = new Map();
    this.chatMessages = new Map();
    this.settings = new Map();
    
    // Initialize new collections
    this.users = new Map();
    this.collections = new Map();
    this.collectionMemberships = new Map();
    this.bookmarkCollections = new Map();
    
    // Initialize session store
    const MemoryStore = createMemoryStore(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    });
  }

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
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
    
    const updatedBookmark = { ...bookmark, ...bookmarkUpdate };
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
      timestamp: activity.timestamp || new Date().toISOString(),
      tags: activity.tags || [],
    };
    
    this.activities.set(id, newActivity);
    return newActivity;
  }
  
  // Tags
  async getTags(): Promise<Tag[]> {
    return Array.from(this.tags.values());
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
  async getChatSessions(): Promise<ChatSession[]> {
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
  async getSettings(): Promise<Setting[]> {
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
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      user => user.email.toLowerCase() === email.toLowerCase()
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
    
    const updatedUser: User = {
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
  
  // Collections methods
  async getCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values());
  }
  
  async getPublicCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values()).filter(
      collection => collection.is_public
    );
  }
  
  async getUserCollections(userId: string): Promise<Collection[]> {
    return Array.from(this.collections.values()).filter(
      collection => collection.owner_id === userId
    );
  }
  
  async getCollection(id: string): Promise<Collection | undefined> {
    return this.collections.get(id);
  }
  
  async getDefaultCollection(userId: string): Promise<Collection | undefined> {
    return Array.from(this.collections.values()).find(
      collection => collection.owner_id === userId && collection.is_default
    );
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
    
    const updatedCollection: Collection = {
      ...collection,
      ...collectionUpdate,
      updated_at: new Date()
    };
    
    this.collections.set(id, updatedCollection);
    return updatedCollection;
  }
  
  async deleteCollection(id: string): Promise<boolean> {
    return this.collections.delete(id);
  }
  
  // Collection Memberships methods
  async getCollectionMembers(collectionId: string): Promise<User[]> {
    const memberships = Array.from(this.collectionMemberships.values()).filter(
      membership => membership.collection_id === collectionId
    );
    
    if (memberships.length === 0) {
      return [];
    }
    
    return memberships
      .map(membership => this.users.get(membership.user_id))
      .filter((user): user is User => !!user);
  }
  
  async getUserCollectionMemberships(userId: string): Promise<CollectionMembership[]> {
    return Array.from(this.collectionMemberships.values()).filter(
      membership => membership.user_id === userId
    );
  }
  
  async addUserToCollection(
    collectionId: string,
    userId: string,
    role: "viewer" | "editor" | "admin" = "viewer"
  ): Promise<CollectionMembership> {
    const id = crypto.randomUUID();
    
    const newMembership: CollectionMembership = {
      id,
      collection_id: collectionId,
      user_id: userId,
      role,
    };
    
    this.collectionMemberships.set(id, newMembership);
    return newMembership;
  }
  
  async updateCollectionMembership(
    collectionId: string,
    userId: string,
    role: "viewer" | "editor" | "admin"
  ): Promise<CollectionMembership | undefined> {
    const membership = Array.from(this.collectionMemberships.values()).find(
      m => m.collection_id === collectionId && m.user_id === userId
    );
    
    if (!membership) return undefined;
    
    const updatedMembership: CollectionMembership = {
      ...membership,
      role
    };
    
    this.collectionMemberships.set(membership.id, updatedMembership);
    return updatedMembership;
  }
  
  async removeUserFromCollection(collectionId: string, userId: string): Promise<boolean> {
    const membership = Array.from(this.collectionMemberships.values()).find(
      m => m.collection_id === collectionId && m.user_id === userId
    );
    
    if (!membership) return false;
    
    return this.collectionMemberships.delete(membership.id);
  }
  
  // Bookmark-Collection relationships
  async getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]> {
    const relationships = Array.from(this.bookmarkCollections.values()).filter(
      rel => rel.collection_id === collectionId
    );
    
    if (relationships.length === 0) {
      return [];
    }
    
    return relationships
      .map(rel => this.bookmarks.get(rel.bookmark_id))
      .filter((bookmark): bookmark is Bookmark => !!bookmark);
  }
  
  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const relationships = Array.from(this.bookmarkCollections.values()).filter(
      rel => rel.bookmark_id === bookmarkId
    );
    
    if (relationships.length === 0) {
      return [];
    }
    
    return relationships
      .map(rel => this.collections.get(rel.collection_id))
      .filter((collection): collection is Collection => !!collection);
  }
  
  async addBookmarkToCollection(bookmarkId: string, collectionId: string): Promise<BookmarkCollection> {
    const id = crypto.randomUUID();
    
    const newRelationship: BookmarkCollection = {
      id,
      bookmark_id: bookmarkId,
      collection_id: collectionId,
    };
    
    this.bookmarkCollections.set(id, newRelationship);
    return newRelationship;
  }
  
  async removeBookmarkFromCollection(bookmarkId: string, collectionId: string): Promise<boolean> {
    const relationship = Array.from(this.bookmarkCollections.values()).find(
      rel => rel.bookmark_id === bookmarkId && rel.collection_id === collectionId
    );
    
    if (!relationship) return false;
    
    return this.bookmarkCollections.delete(relationship.id);
  }
}

// PostgreSQL database storage implementation
export class DatabaseStorage implements IStorage {
  // Session store for auth
  sessionStore: any;
  
  constructor() {
    // We'll initialize the session store in auth.ts
    this.sessionStore = null;
  }
  
  // Users
  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }
  
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }
  
  async updateUser(id: string, userUpdate: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...userUpdate,
        updated_at: new Date()
      })
      .where(eq(users.id, id))
      .returning();
    
    return updatedUser;
  }
  
  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return result.length > 0;
  }
  
  // Collections
  async getCollections(): Promise<Collection[]> {
    return await db.select().from(collections);
  }
  
  async getPublicCollections(): Promise<Collection[]> {
    return await db.select().from(collections).where(eq(collections.is_public, true));
  }
  
  async getUserCollections(userId: string): Promise<Collection[]> {
    return await db.select().from(collections).where(eq(collections.owner_id, userId));
  }
  
  async getCollection(id: string): Promise<Collection | undefined> {
    const [collection] = await db.select().from(collections).where(eq(collections.id, id));
    return collection;
  }
  
  async getDefaultCollection(userId: string): Promise<Collection | undefined> {
    const [collection] = await db.select()
      .from(collections)
      .where(eq(collections.owner_id, userId))
      .where(eq(collections.is_default, true));
    return collection;
  }
  
  async createCollection(collection: InsertCollection): Promise<Collection> {
    const [newCollection] = await db.insert(collections).values(collection).returning();
    return newCollection;
  }
  
  async updateCollection(id: string, collectionUpdate: Partial<InsertCollection>): Promise<Collection | undefined> {
    const [updatedCollection] = await db
      .update(collections)
      .set({
        ...collectionUpdate,
        updated_at: new Date()
      })
      .where(eq(collections.id, id))
      .returning();
    
    return updatedCollection;
  }
  
  async deleteCollection(id: string): Promise<boolean> {
    const result = await db.delete(collections).where(eq(collections.id, id)).returning({ id: collections.id });
    return result.length > 0;
  }
  
  // Collection Memberships
  async getCollectionMembers(collectionId: string): Promise<User[]> {
    const memberships = await db.select({
      user_id: collectionMemberships.user_id
    })
    .from(collectionMemberships)
    .where(eq(collectionMemberships.collection_id, collectionId));
    
    if (memberships.length === 0) {
      return [];
    }
    
    const userIds = memberships.map(m => m.user_id);
    return await db.select().from(users).where(sql`${users.id} IN ${userIds}`);
  }
  
  async getUserCollectionMemberships(userId: string): Promise<CollectionMembership[]> {
    return await db.select()
      .from(collectionMemberships)
      .where(eq(collectionMemberships.user_id, userId));
  }
  
  async addUserToCollection(
    collectionId: string,
    userId: string,
    role: "viewer" | "editor" | "admin" = "viewer"
  ): Promise<CollectionMembership> {
    const [membership] = await db.insert(collectionMemberships).values({
      collection_id: collectionId,
      user_id: userId,
      role
    }).returning();
    
    return membership;
  }
  
  async updateCollectionMembership(
    collectionId: string,
    userId: string,
    role: "viewer" | "editor" | "admin"
  ): Promise<CollectionMembership | undefined> {
    const [updatedMembership] = await db
      .update(collectionMemberships)
      .set({ role })
      .where(
        sql`${collectionMemberships.collection_id} = ${collectionId} AND ${collectionMemberships.user_id} = ${userId}`
      )
      .returning();
    
    return updatedMembership;
  }
  
  async removeUserFromCollection(collectionId: string, userId: string): Promise<boolean> {
    const result = await db.delete(collectionMemberships)
      .where(
        sql`${collectionMemberships.collection_id} = ${collectionId} AND ${collectionMemberships.user_id} = ${userId}`
      )
      .returning();
    
    return result.length > 0;
  }
  
  // Bookmark-Collection relationships
  async getBookmarksByCollectionId(collectionId: string): Promise<Bookmark[]> {
    const relationships = await db.select({
      bookmark_id: bookmarkCollections.bookmark_id
    })
    .from(bookmarkCollections)
    .where(eq(bookmarkCollections.collection_id, collectionId));
    
    if (relationships.length === 0) {
      return [];
    }
    
    const bookmarkIds = relationships.map(rel => rel.bookmark_id);
    return await db.select().from(bookmarks).where(sql`${bookmarks.id} IN ${bookmarkIds}`);
  }
  
  async getCollectionsByBookmarkId(bookmarkId: string): Promise<Collection[]> {
    const relationships = await db.select({
      collection_id: bookmarkCollections.collection_id
    })
    .from(bookmarkCollections)
    .where(eq(bookmarkCollections.bookmark_id, bookmarkId));
    
    if (relationships.length === 0) {
      return [];
    }
    
    const collectionIds = relationships.map(rel => rel.collection_id);
    return await db.select().from(collections).where(sql`${collections.id} IN ${collectionIds}`);
  }
  
  async addBookmarkToCollection(bookmarkId: string, collectionId: string): Promise<BookmarkCollection> {
    const [relationship] = await db.insert(bookmarkCollections).values({
      bookmark_id: bookmarkId,
      collection_id: collectionId
    }).returning();
    
    return relationship;
  }
  
  async removeBookmarkFromCollection(bookmarkId: string, collectionId: string): Promise<boolean> {
    const result = await db.delete(bookmarkCollections)
      .where(
        sql`${bookmarkCollections.bookmark_id} = ${bookmarkId} AND ${bookmarkCollections.collection_id} = ${collectionId}`
      )
      .returning();
    
    return result.length > 0;
  }
  
  async addBookmarkToCollection(bookmarkId: string, collectionId: string): Promise<BookmarkCollection> {
    const [relationship] = await db
      .insert(bookmarkCollections)
      .values({
        bookmark_id: bookmarkId,
        collection_id: collectionId
      })
      .returning();
    
    return relationship;
  }
  
  async removeBookmarkFromCollection(bookmarkId: string, collectionId: string): Promise<boolean> {
    const result = await db
      .delete(bookmarkCollections)
      .where(sql`${bookmarkCollections.bookmark_id} = ${bookmarkId} AND ${bookmarkCollections.collection_id} = ${collectionId}`)
      .returning({ id: bookmarkCollections.id });
    
    return result.length > 0;
  }
  
  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
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
      .set(bookmarkUpdate)
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
  async getActivities(): Promise<Activity[]> {
    return await db.select().from(activities).orderBy(desc(activities.timestamp));
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    // Ensure timestamp is a Date object
    const activityData = {
      ...activity,
      timestamp: new Date()
    };
    
    const [newActivity] = await db.insert(activities).values(activityData).returning();
    return newActivity;
  }
  
  // Tags
  async getTags(): Promise<Tag[]> {
    const existingTags = await db.select().from(tags);
    
    // If we have tags in the normalized system, return them
    if (existingTags.length > 0) {
      return existingTags;
    }
    
    // Otherwise, extract tags from bookmarks and populate the tags table on the fly
    const allBookmarks = await db.select().from(bookmarks);
    
    // Collect all unique tags
    const uniqueUserTags = new Set<string>();
    const uniqueSystemTags = new Set<string>();
    
    allBookmarks.forEach(bookmark => {
      if (bookmark.user_tags && Array.isArray(bookmark.user_tags)) {
        bookmark.user_tags.forEach(tag => uniqueUserTags.add(tag));
      }
      
      if (bookmark.system_tags && Array.isArray(bookmark.system_tags)) {
        bookmark.system_tags.forEach(tag => uniqueSystemTags.add(tag));
      }
    });
    
    // Insert user tags
    const userTagPromises = Array.from(uniqueUserTags).map(async tagName => {
      try {
        // Create tag if it doesn't exist
        const [newTag] = await db.insert(tags).values({
          name: tagName,
          type: "user",
          count: 0 // Will be updated later
        }).returning();
        
        return newTag;
      } catch (error) {
        // If duplicate, get existing tag
        const [existingTag] = await db.select().from(tags).where(eq(tags.name, tagName));
        return existingTag;
      }
    });
    
    // Insert system tags
    const systemTagPromises = Array.from(uniqueSystemTags).map(async tagName => {
      try {
        // Create tag if it doesn't exist
        const [newTag] = await db.insert(tags).values({
          name: tagName,
          type: "system",
          count: 0 // Will be updated later
        }).returning();
        
        return newTag;
      } catch (error) {
        // If duplicate, get existing tag
        const [existingTag] = await db.select().from(tags).where(eq(tags.name, tagName));
        return existingTag;
      }
    });
    
    const userTags = await Promise.all(userTagPromises);
    const systemTags = await Promise.all(systemTagPromises);
    
    // Return all tags
    return [...userTags, ...systemTags];
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
  async getChatSessions(): Promise<ChatSession[]> {
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
      updated_at: now
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
  async getSettings(): Promise<Setting[]> {
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
