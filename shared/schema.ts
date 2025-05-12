import { pgTable, text, serial, integer, boolean, timestamp, uuid, json, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Chat Sessions table for persistent chat
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").default("New Chat"), // Making this nullable to fix the type error
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  filters: jsonb("filters"), // Stores the filter settings for this chat session
  user_id: uuid("user_id").references(() => users.id), // Reference to the user who owns this chat session
});

// Chat Messages table to store conversation history
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  session_id: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull()
});

// Define relationship between chat sessions and users
export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.user_id],
    references: [users.id]
  }),
  messages: many(chatMessages)
}));

// Define relationship between chat messages and chat sessions
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.session_id],
    references: [chatSessions.id]
  })
}));

// Users table
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  email_verified: boolean("email_verified").default(false).notNull(),
  verification_token: text("verification_token"),
  verification_expires: timestamp("verification_expires"),
  reset_token: text("reset_token"),
  reset_expires: timestamp("reset_expires"),
});

// Bookmarks table
export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  content_html: text("content_html"),
  // Use a text array to store vector embedding until pgvector extension is properly configured
  vector_embedding: text("vector_embedding").array(),
  date_saved: timestamp("date_saved").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  // Optional creation date for external content (when available from source)
  created_at: timestamp("created_at"),  // When the content was originally created (e.g., tweet date)
  source: text("source", { enum: ["extension", "web", "import", "x"] }).notNull(),
  // AI processing status to track the workflow
  ai_processing_status: text("ai_processing_status", { 
    enum: ["pending", "processing", "completed", "failed"] 
  }).default("pending"),
  // Reference to the user who owns this bookmark
  user_id: uuid("user_id").references(() => users.id),
  // X.com specific fields
  external_id: text("external_id"),  // Tweet ID or other external identifier
  author_username: text("author_username"),  // X.com username of the author
  author_name: text("author_name"),  // Display name of the author
  like_count: integer("like_count"),  // Number of likes
  repost_count: integer("repost_count"),  // Number of reposts/retweets
  reply_count: integer("reply_count"),  // Number of replies
  quote_count: integer("quote_count"),  // Number of quote tweets
  media_urls: text("media_urls").array(),  // URLs of media in the tweet
});

// Collections table
export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  is_public: boolean("is_public").default(false).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Collection-Bookmarks join table
export const collectionBookmarks = pgTable("collection_bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  collection_id: uuid("collection_id").references(() => collections.id, { onDelete: "cascade" }).notNull(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
}, (table) => {
  return {
    // Add a unique constraint to prevent duplicate bookmark entries in a collection
    uniqueBookmarkInCollection: unique().on(table.collection_id, table.bookmark_id),
  };
});

// Notes table
export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Screenshots table
export const screenshots = pgTable("screenshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  image_url: text("image_url").notNull(),
  uploaded_at: timestamp("uploaded_at").defaultNow().notNull(),
});

// Highlights table
export const highlights = pgTable("highlights", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  quote: text("quote").notNull(),
  position_selector: json("position_selector"),
});

// Insights table
export const insights = pgTable("insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  summary: text("summary"),
  sentiment: integer("sentiment"),
  depth_level: integer("depth_level").default(1),
  related_links: text("related_links").array().default([]),
});

// Activities table
export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }),
  bookmark_title: text("bookmark_title"),
  user_id: uuid("user_id").references(() => users.id),
  // Standard activity fields in current database
  type: text("type", { 
    enum: ["bookmark_added", "bookmark_updated", "note_added", "highlight_added", "insight_generated", "login", "logout", "register", "collection_created"] 
  }).notNull(),
  content: text("content"),
  tags: text("tags").array().default([]),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Tags table for normalized tags
export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  type: text("type", { enum: ["user", "system"] }).notNull().default("user"),
  count: integer("count").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Bookmark-Tags join table
export const bookmarkTags = pgTable("bookmark_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  tag_id: uuid("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
});

// Settings table for user-configurable settings
export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  user_id: uuid("user_id").references(() => users.id),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Relations between tables
export const usersRelations = relations(users, ({ many }) => ({
  bookmarks: many(bookmarks),
  collections: many(collections),
  activities: many(activities),
  settings: many(settings),
  chatSessions: many(chatSessions),
  reports: many(reports),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, {
    fields: [activities.user_id],
    references: [users.id],
  }),
  bookmark: one(bookmarks, {
    fields: [activities.bookmark_id],
    references: [bookmarks.id],
  }),
}));

export const settingsRelations = relations(settings, ({ one }) => ({
  user: one(users, {
    fields: [settings.user_id],
    references: [users.id],
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  user: one(users, {
    fields: [bookmarks.user_id],
    references: [users.id],
  }),
  notes: many(notes),
  highlights: many(highlights),
  screenshots: many(screenshots),
  insights: many(insights),
  bookmarkTags: many(bookmarkTags),
  reportBookmarks: many(reportBookmarks),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.user_id],
    references: [users.id],
  }),
  collectionBookmarks: many(collectionBookmarks),
}));

export const collectionBookmarksRelations = relations(collectionBookmarks, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionBookmarks.collection_id],
    references: [collections.id],
  }),
  bookmark: one(bookmarks, {
    fields: [collectionBookmarks.bookmark_id],
    references: [bookmarks.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertCollectionBookmarkSchema = createInsertSchema(collectionBookmarks).omit({
  id: true,
});

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({
  id: true,
  vector_embedding: true,
  updated_at: true,
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
});

export const insertScreenshotSchema = createInsertSchema(screenshots).omit({
  id: true,
});

export const insertHighlightSchema = createInsertSchema(highlights).omit({
  id: true,
});

export const insertInsightSchema = createInsertSchema(insights).omit({
  id: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  count: true,
  created_at: true,
});

export const insertBookmarkTagSchema = createInsertSchema(bookmarkTags).omit({
  id: true,
});

// Chat Schemas
export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

// Settings Schema
export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updated_at: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Collection = typeof collections.$inferSelect;

export type InsertCollectionBookmark = z.infer<typeof insertCollectionBookmarkSchema>;
export type CollectionBookmark = typeof collectionBookmarks.$inferSelect;

export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;
export type Bookmark = typeof bookmarks.$inferSelect;

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type InsertScreenshot = z.infer<typeof insertScreenshotSchema>;
export type Screenshot = typeof screenshots.$inferSelect;

export type InsertHighlight = z.infer<typeof insertHighlightSchema>;
export type Highlight = typeof highlights.$inferSelect;

export type InsertInsight = z.infer<typeof insertInsightSchema>;
export type Insight = typeof insights.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export type InsertTag = z.infer<typeof insertTagSchema>;
export type Tag = typeof tags.$inferSelect;

export type InsertBookmarkTag = z.infer<typeof insertBookmarkTagSchema>;
export type BookmarkTag = typeof bookmarkTags.$inferSelect;

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Weekly Insights Reports table
export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(), // The full AI-generated report content
  time_period_start: timestamp("time_period_start").notNull(),
  time_period_end: timestamp("time_period_end").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  status: text("status", { enum: ["generating", "completed", "failed"] }).default("generating").notNull(),
});

// Report Bookmarks join table to track which bookmarks were included in each report
export const reportBookmarks = pgTable("report_bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  report_id: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }).notNull(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
});

// Relations for reports
export const reportsRelations = relations(reports, ({ one, many }) => ({
  user: one(users, {
    fields: [reports.user_id],
    references: [users.id],
  }),
  reportBookmarks: many(reportBookmarks),
}));

// Relations for report bookmarks
export const reportBookmarksRelations = relations(reportBookmarks, ({ one }) => ({
  report: one(reports, {
    fields: [reportBookmarks.report_id],
    references: [reports.id],
  }),
  bookmark: one(bookmarks, {
    fields: [reportBookmarks.bookmark_id],
    references: [bookmarks.id],
  }),
}));

// X.com integration tables
export const xCredentials = pgTable("x_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  access_token: text("access_token").notNull(),
  refresh_token: text("refresh_token"),
  token_expires_at: timestamp("token_expires_at"),
  x_user_id: text("x_user_id").notNull(),
  x_username: text("x_username").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_sync_at: timestamp("last_sync_at"),
});

// X.com folders and their mapping to collections
export const xFolders = pgTable("x_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  x_folder_id: text("x_folder_id").notNull(),
  x_folder_name: text("x_folder_name").notNull(),
  collection_id: uuid("collection_id").references(() => collections.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_sync_at: timestamp("last_sync_at"),
});

// Relations for X tables
export const xCredentialsRelations = relations(xCredentials, ({ one }) => ({
  user: one(users, {
    fields: [xCredentials.user_id],
    references: [users.id],
  }),
}));

// X Sync locks table to prevent multiple syncs for the same user
export const xSyncLocks = pgTable("x_sync_locks", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").references(() => users.id).notNull().unique(),
  locked_at: timestamp("locked_at").defaultNow().notNull(),
  expires_at: timestamp("expires_at").notNull(), // Lock will auto-expire after this time
});

export const xSyncLocksRelations = relations(xSyncLocks, ({ one }) => ({
  user: one(users, {
    fields: [xSyncLocks.user_id],
    references: [users.id],
  }),
}));

export const xFoldersRelations = relations(xFolders, ({ one }) => ({
  user: one(users, {
    fields: [xFolders.user_id],
    references: [users.id],
  }),
  collection: one(collections, {
    fields: [xFolders.collection_id],
    references: [collections.id],
  }),
}));

// Insert schemas for reports tables
export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  created_at: true,
  status: true,
});

export const insertReportBookmarkSchema = createInsertSchema(reportBookmarks).omit({
  id: true,
});

// Insert schemas for X tables
export const insertXCredentialsSchema = createInsertSchema(xCredentials).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertXFoldersSchema = createInsertSchema(xFolders).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// Types for reports tables
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;

export type InsertReportBookmark = z.infer<typeof insertReportBookmarkSchema>;
export type ReportBookmark = typeof reportBookmarks.$inferSelect;

// Types for X tables
export type InsertXCredentials = z.infer<typeof insertXCredentialsSchema>;
export type XCredentials = typeof xCredentials.$inferSelect;

export type InsertXFolder = z.infer<typeof insertXFoldersSchema>;
export type XFolder = typeof xFolders.$inferSelect;
