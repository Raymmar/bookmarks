import { 
  bookmarks, Bookmark, InsertBookmark,
  notes, Note, InsertNote,
  screenshots, Screenshot, InsertScreenshot,
  highlights, Highlight, InsertHighlight,
  insights, Insight, InsertInsight,
  activities, Activity, InsertActivity,
  tags, Tag, InsertTag,
  bookmarkTags, BookmarkTag, InsertBookmarkTag
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

// Storage interface
export interface IStorage {
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
  
  constructor() {
    this.bookmarks = new Map();
    this.notes = new Map();
    this.screenshots = new Map();
    this.highlights = new Map();
    this.insights = new Map();
    this.activities = new Map();
    this.tags = new Map();
    this.bookmarkTags = new Map();
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
}

// PostgreSQL database storage implementation
export class DatabaseStorage implements IStorage {
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
}

// Use the database storage implementation 
export const storage = new DatabaseStorage();
