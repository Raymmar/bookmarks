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
import { db, pool } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import createMemoryStore from "memorystore";
import session from "express-session";
import connectPg from "connect-pg-simple";
import crypto from "crypto";

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

// Database Storage Implementation
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
    const result = await db.delete(users).where(eq(users.id, id)).returning();
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
    const result = await db.delete(collections).where(eq(collections.id, id)).returning();
    return result.length > 0;
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
      .where(sql`${collectionMemberships.collection_id} = ${collectionId} AND ${collectionMemberships.user_id} = ${userId}`)
      .returning();
    return updatedMembership;
  }

  async removeUserFromCollection(collectionId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(collectionMemberships)
      .where(sql`${collectionMemberships.collection_id} = ${collectionId} AND ${collectionMemberships.user_id} = ${userId}`)
      .returning();
    return result.length > 0;
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
      .where(sql`${bookmarkCollections.bookmark_id} = ${bookmarkId} AND ${bookmarkCollections.collection_id} = ${collectionId}`)
      .returning();
    return result.length > 0;
  }

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
    return await db.select().from(bookmarks);
  }
  
  async getBookmark(id: string): Promise<Bookmark | undefined> {
    const [bookmark] = await db.select().from(bookmarks).where(eq(bookmarks.id, id));
    return bookmark;
  }
  
  async createBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    const [newBookmark] = await db.insert(bookmarks).values({
      ...bookmark,
      date_saved: new Date()
    }).returning();
    return newBookmark;
  }
  
  async updateBookmark(id: string, updates: Partial<InsertBookmark>): Promise<Bookmark | undefined> {
    const [updatedBookmark] = await db
      .update(bookmarks)
      .set(updates)
      .where(eq(bookmarks.id, id))
      .returning();
    return updatedBookmark;
  }
  
  async deleteBookmark(id: string): Promise<boolean> {
    const result = await db.delete(bookmarks).where(eq(bookmarks.id, id)).returning();
    return result.length > 0;
  }
  
  // Notes
  async getNotesByBookmarkId(bookmarkId: string): Promise<Note[]> {
    return await db
      .select()
      .from(notes)
      .where(eq(notes.bookmark_id, bookmarkId));
  }
  
  async createNote(note: InsertNote): Promise<Note> {
    const [newNote] = await db.insert(notes).values({
      ...note,
      timestamp: new Date()
    }).returning();
    return newNote;
  }
  
  async deleteNote(id: string): Promise<boolean> {
    const result = await db.delete(notes).where(eq(notes.id, id)).returning();
    return result.length > 0;
  }
  
  // Screenshots
  async getScreenshotsByBookmarkId(bookmarkId: string): Promise<Screenshot[]> {
    return await db
      .select()
      .from(screenshots)
      .where(eq(screenshots.bookmark_id, bookmarkId));
  }
  
  async createScreenshot(screenshot: InsertScreenshot): Promise<Screenshot> {
    const [newScreenshot] = await db.insert(screenshots).values({
      ...screenshot,
      uploaded_at: new Date()
    }).returning();
    return newScreenshot;
  }
  
  async deleteScreenshot(id: string): Promise<boolean> {
    const result = await db.delete(screenshots).where(eq(screenshots.id, id)).returning();
    return result.length > 0;
  }
  
  // Highlights
  async getHighlightsByBookmarkId(bookmarkId: string): Promise<Highlight[]> {
    return await db
      .select()
      .from(highlights)
      .where(eq(highlights.bookmark_id, bookmarkId));
  }
  
  async createHighlight(highlight: InsertHighlight): Promise<Highlight> {
    const [newHighlight] = await db.insert(highlights).values(highlight).returning();
    return newHighlight;
  }
  
  async deleteHighlight(id: string): Promise<boolean> {
    const result = await db.delete(highlights).where(eq(highlights.id, id)).returning();
    return result.length > 0;
  }
  
  // Insights
  async getInsightByBookmarkId(bookmarkId: string): Promise<Insight | undefined> {
    const [insight] = await db
      .select()
      .from(insights)
      .where(eq(insights.bookmark_id, bookmarkId));
    return insight;
  }
  
  async createInsight(insight: InsertInsight): Promise<Insight> {
    const [newInsight] = await db.insert(insights).values(insight).returning();
    return newInsight;
  }
  
  async updateInsight(id: string, updates: Partial<InsertInsight>): Promise<Insight | undefined> {
    const [updatedInsight] = await db
      .update(insights)
      .set(updates)
      .where(eq(insights.id, id))
      .returning();
    return updatedInsight;
  }
  
  // Activities
  async getActivities(): Promise<Activity[]> {
    return await db
      .select()
      .from(activities)
      .orderBy(desc(activities.timestamp));
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [newActivity] = await db.insert(activities).values(activity).returning();
    return newActivity;
  }
  
  // Tags
  async getTags(): Promise<Tag[]> {
    return await db.select().from(tags);
  }
  
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }
  
  async getTagByName(name: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.name, name));
    return tag;
  }
  
  async createTag(tag: InsertTag): Promise<Tag> {
    const [newTag] = await db.insert(tags).values(tag).returning();
    return newTag;
  }
  
  async updateTag(id: string, updates: Partial<InsertTag>): Promise<Tag | undefined> {
    const [updatedTag] = await db
      .update(tags)
      .set(updates)
      .where(eq(tags.id, id))
      .returning();
    return updatedTag;
  }
  
  async incrementTagCount(id: string): Promise<Tag | undefined> {
    const tag = await this.getTag(id);
    if (!tag) return undefined;
    
    const [updatedTag] = await db
      .update(tags)
      .set({ count: tag.count + 1 })
      .where(eq(tags.id, id))
      .returning();
    return updatedTag;
  }
  
  async decrementTagCount(id: string): Promise<Tag | undefined> {
    const tag = await this.getTag(id);
    if (!tag) return undefined;
    
    const [updatedTag] = await db
      .update(tags)
      .set({ count: Math.max(0, tag.count - 1) })
      .where(eq(tags.id, id))
      .returning();
    return updatedTag;
  }
  
  async deleteTag(id: string): Promise<boolean> {
    const result = await db.delete(tags).where(eq(tags.id, id)).returning();
    return result.length > 0;
  }
  
  // BookmarkTags
  async getTagsByBookmarkId(bookmarkId: string): Promise<Tag[]> {
    const bookmarkTagEntries = await db
      .select()
      .from(bookmarkTags)
      .where(eq(bookmarkTags.bookmark_id, bookmarkId));
    
    const tagIds = bookmarkTagEntries.map(entry => entry.tag_id);
    
    if (tagIds.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(tags)
      .where(sql`${tags.id} IN (${tagIds.join(',')})`);
  }
  
  async getBookmarksByTagId(tagId: string): Promise<Bookmark[]> {
    const bookmarkTagEntries = await db
      .select()
      .from(bookmarkTags)
      .where(eq(bookmarkTags.tag_id, tagId));
    
    const bookmarkIds = bookmarkTagEntries.map(entry => entry.bookmark_id);
    
    if (bookmarkIds.length === 0) {
      return [];
    }
    
    return await db
      .select()
      .from(bookmarks)
      .where(sql`${bookmarks.id} IN (${bookmarkIds.join(',')})`);
  }
  
  async addTagToBookmark(bookmarkId: string, tagId: string): Promise<BookmarkTag> {
    const [bookmarkTag] = await db
      .insert(bookmarkTags)
      .values({
        id: crypto.randomUUID(),
        bookmark_id: bookmarkId,
        tag_id: tagId
      })
      .returning();
    
    // Increment tag count
    await this.incrementTagCount(tagId);
    
    return bookmarkTag;
  }
  
  async removeTagFromBookmark(bookmarkId: string, tagId: string): Promise<boolean> {
    const result = await db
      .delete(bookmarkTags)
      .where(sql`${bookmarkTags.bookmark_id} = ${bookmarkId} AND ${bookmarkTags.tag_id} = ${tagId}`)
      .returning();
    
    if (result.length > 0) {
      // Decrement tag count
      await this.decrementTagCount(tagId);
      return true;
    }
    
    return false;
  }
  
  // Chat Sessions
  async getChatSessions(): Promise<ChatSession[]> {
    return await db.select().from(chatSessions);
  }
  
  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }
  
  async createChatSession(session: InsertChatSession): Promise<ChatSession> {
    const [newSession] = await db.insert(chatSessions).values(session).returning();
    return newSession;
  }
  
  async updateChatSession(id: string, updates: Partial<InsertChatSession>): Promise<ChatSession | undefined> {
    const [updatedSession] = await db
      .update(chatSessions)
      .set(updates)
      .where(eq(chatSessions.id, id))
      .returning();
    return updatedSession;
  }
  
  async deleteChatSession(id: string): Promise<boolean> {
    const result = await db.delete(chatSessions).where(eq(chatSessions.id, id)).returning();
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
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }
  
  async deleteChatMessagesBySessionId(sessionId: string): Promise<boolean> {
    const result = await db
      .delete(chatMessages)
      .where(eq(chatMessages.session_id, sessionId))
      .returning();
    return result.length > 0;
  }
  
  // Settings
  async getSettings(): Promise<Setting[]> {
    return await db.select().from(settings);
  }
  
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }
  
  async createSetting(setting: InsertSetting): Promise<Setting> {
    const [newSetting] = await db.insert(settings).values(setting).returning();
    return newSetting;
  }
  
  async updateSetting(key: string, value: string): Promise<Setting | undefined> {
    const [updatedSetting] = await db
      .update(settings)
      .set({ value, updated_at: new Date() })
      .where(eq(settings.key, key))
      .returning();
    return updatedSetting;
  }
  
  async deleteSetting(key: string): Promise<boolean> {
    const result = await db.delete(settings).where(eq(settings.key, key)).returning();
    return result.length > 0;
  }
}

// Use the database storage implementation
export const storage = new DatabaseStorage();