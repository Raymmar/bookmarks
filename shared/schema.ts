import { pgTable, text, serial, integer, boolean, timestamp, uuid, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  // Only keeping system_tags for internal tag generation
  system_tags: text("system_tags").array().default([]),
  source: text("source", { enum: ["extension", "web", "import"] }).notNull(),
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

// Insert Schemas
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

// Types
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
