import { 
  bookmarks, Bookmark, InsertBookmark,
  notes, Note, InsertNote,
  screenshots, Screenshot, InsertScreenshot,
  highlights, Highlight, InsertHighlight,
  insights, Insight, InsertInsight,
  activities, Activity, InsertActivity
} from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private bookmarks: Map<string, Bookmark>;
  private notes: Map<string, Note>;
  private screenshots: Map<string, Screenshot>;
  private highlights: Map<string, Highlight>;
  private insights: Map<string, Insight>;
  private activities: Map<string, Activity>;

  constructor() {
    this.bookmarks = new Map();
    this.notes = new Map();
    this.screenshots = new Map();
    this.highlights = new Map();
    this.insights = new Map();
    this.activities = new Map();
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
    const newBookmark: Bookmark = {
      ...bookmark,
      id,
      date_saved: bookmark.date_saved || new Date().toISOString(),
      user_tags: bookmark.user_tags || [],
      system_tags: bookmark.system_tags || [],
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
    const newNote: Note = {
      ...note,
      id,
      timestamp: note.timestamp || new Date().toISOString(),
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
    const newScreenshot: Screenshot = {
      ...screenshot,
      id,
      uploaded_at: screenshot.uploaded_at || new Date().toISOString(),
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
    const newHighlight: Highlight = {
      ...highlight,
      id,
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
}

export const storage = new MemStorage();
