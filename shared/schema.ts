import { pgTable, text, serial, integer, boolean, timestamp, uuid, json, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table for authentication
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Collections table for organizing bookmarks
export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  is_public: boolean("is_public").default(false).notNull(),
  is_default: boolean("is_default").default(false).notNull(),
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Collection Memberships for shared collections
export const collectionMemberships = pgTable("collection_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  collection_id: uuid("collection_id").references(() => collections.id, { onDelete: "cascade" }).notNull(),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role", { enum: ["viewer", "editor", "admin"] }).default("viewer").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Bookmark-Collection relationships (many-to-many)
export const bookmarkCollections = pgTable("bookmark_collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookmark_id: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }).notNull(),
  collection_id: uuid("collection_id").references(() => collections.id, { onDelete: "cascade" }).notNull(),
  added_at: timestamp("added_at").defaultNow().notNull(),
});

// Chat Sessions table for persistent chat
export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").default("New Chat"), // Making this nullable to fix the type error
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  filters: jsonb("filters") // Stores the filter settings for this chat session
});

// Chat Messages table to store conversation history
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  session_id: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull()
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
  source: text("source", { enum: ["extension", "web", "import"] }).notNull(),
  // AI processing status to track the workflow
  ai_processing_status: text("ai_processing_status", { 
    enum: ["pending", "processing", "completed", "failed"] 
  }).default("pending"),
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
  type: text("type", { 
    enum: ["bookmark_added", "note_added", "highlight_added", "insight_generated"] 
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
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  collections: many(collections, { relationName: "user_collections" }),
  collectionMemberships: many(collectionMemberships, { relationName: "user_memberships" }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  owner: one(users, {
    fields: [collections.owner_id],
    references: [users.id],
    relationName: "user_collections"
  }),
  memberships: many(collectionMemberships, { relationName: "collection_memberships" }),
  bookmarks: many(bookmarkCollections, { relationName: "collection_bookmarks" }),
}));

export const collectionMembershipsRelations = relations(collectionMemberships, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionMemberships.collection_id],
    references: [collections.id],
    relationName: "collection_memberships"
  }),
  user: one(users, {
    fields: [collectionMemberships.user_id],
    references: [users.id],
    relationName: "user_memberships"
  }),
}));

export const bookmarkCollectionsRelations = relations(bookmarkCollections, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkCollections.bookmark_id],
    references: [bookmarks.id]
  }),
  collection: one(collections, {
    fields: [bookmarkCollections.collection_id],
    references: [collections.id],
    relationName: "collection_bookmarks"
  }),
}));

export const bookmarksRelations = relations(bookmarks, ({ many }) => ({
  notes: many(notes),
  screenshots: many(screenshots),
  highlights: many(highlights),
  collections: many(bookmarkCollections),
  tags: many(bookmarkTags),
}));

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.bookmark_id],
    references: [bookmarks.id]
  }),
  tag: one(tags, {
    fields: [bookmarkTags.tag_id],
    references: [tags.id]
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

export const insertCollectionMembershipSchema = createInsertSchema(collectionMemberships).omit({
  id: true,
  created_at: true,
});

export const insertBookmarkCollectionSchema = createInsertSchema(bookmarkCollections).omit({
  id: true,
  added_at: true,
});

export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({
  id: true,
  vector_embedding: true,
  user_tags: true, // Remove user_tags since we're using the normalized tag system now
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

export type InsertCollectionMembership = z.infer<typeof insertCollectionMembershipSchema>;
export type CollectionMembership = typeof collectionMemberships.$inferSelect;

export type InsertBookmarkCollection = z.infer<typeof insertBookmarkCollectionSchema>;
export type BookmarkCollection = typeof bookmarkCollections.$inferSelect;

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
