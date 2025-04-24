import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractMetadata } from "./lib/metadata-extractor";
import { processContent, generateEmbedding, generateInsights, generateTags, summarizeContent, generateChatResponse } from "./lib/content-processor";
import { z } from "zod";
import { 
  insertBookmarkSchema, insertNoteSchema, insertHighlightSchema, 
  insertScreenshotSchema, insertInsightSchema, insertActivitySchema,
  insertTagSchema, insertBookmarkTagSchema, 
  insertChatSessionSchema, insertChatMessageSchema, insertSettingSchema,
  insertXFoldersSchema
} from "@shared/schema";
import { normalizeUrl, areUrlsEquivalent } from "@shared/url-service";
import { bookmarkService } from "./lib/bookmark-service";
import { setupAuth } from "./auth";
import { xService } from "./lib/x-service";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Set up authentication
  setupAuth(app);

  // Bookmarks API endpoints
  app.get("/api/bookmarks", async (req, res) => {
    try {
      // If user is authenticated, filter bookmarks by user_id
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : undefined;
      const bookmarks = await storage.getBookmarks(userId);
      
      // Populate the bookmarks with related data
      const populatedBookmarks = await Promise.all(
        bookmarks.map(async (bookmark) => {
          const notes = await storage.getNotesByBookmarkId(bookmark.id);
          const highlights = await storage.getHighlightsByBookmarkId(bookmark.id);
          const screenshots = await storage.getScreenshotsByBookmarkId(bookmark.id);
          const insights = await storage.getInsightByBookmarkId(bookmark.id);
          
          return {
            ...bookmark,
            notes,
            highlights,
            screenshots,
            insights
          };
        })
      );

      res.json(populatedBookmarks);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve bookmarks" });
    }
  });

  app.get("/api/bookmarks/:id", async (req, res) => {
    try {
      const bookmark = await storage.getBookmark(req.params.id);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      res.json(bookmark);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve bookmark" });
    }
  });

  app.post("/api/bookmarks", async (req, res) => {
    try {
      const parsedData = insertBookmarkSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid bookmark data", details: parsedData.error });
      }
      
      const bookmarkData = parsedData.data;
      
      // Get user ID if user is authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : null;
      
      // Log full request body for debugging
      console.log("Creating bookmark with request body:", JSON.stringify(req.body, null, 2));
      
      // Use centralized bookmark service for creation with all processing
      const result = await bookmarkService.createBookmark({
        url: bookmarkData.url,
        title: bookmarkData.title,
        description: bookmarkData.description,
        content_html: bookmarkData.content_html,
        notes: req.body.notes ? (Array.isArray(req.body.notes) ? req.body.notes[0]?.text : req.body.notes) : undefined,
        tags: req.body.tags || [], // Get tags from req.body.tags
        autoExtract: req.body.autoExtract === true || req.body.autoExtract === "true", // Ensure boolean conversion
        insightDepth: req.body.insightDepth ? parseInt(req.body.insightDepth) : 1, // Ensure numeric
        source: bookmarkData.source || 'web',
        user_id: userId
      });
      
      if (result.isExisting) {
        // If URL already exists, return it with appropriate message
        return res.status(200).json({
          ...result.bookmark,
          message: "URL already exists in bookmarks",
          existingBookmarkId: result.bookmark.id
        });
      }
      
      // Return the newly created bookmark
      res.status(201).json(result.bookmark);
    } catch (error) {
      console.error("Error creating bookmark:", error);
      res.status(500).json({ error: "Failed to create bookmark" });
    }
  });

  app.patch("/api/bookmarks/:id", async (req, res) => {
    try {
      // Use centralized bookmark service for updates
      try {
        console.log("Updating bookmark with request body:", JSON.stringify(req.body, null, 2));
        
        const updatedBookmark = await bookmarkService.updateBookmark(req.params.id, {
          url: req.body.url,
          title: req.body.title,
          description: req.body.description,
          notes: req.body.notes,
          tags: req.body.tags || [], // Get tags from req.body.tags
          source: req.body.source
        });
        
        // Create activity log for bookmark update
        const userId = (req.user as any)?.id || null;
        
        // Prepare update activity details
        let activityContent = "Bookmark updated";
        let updatedTags: string[] = [];
        
        // Check what was updated
        if (req.body.description) {
          activityContent += " with new description";
        }
        if (req.body.notes) {
          activityContent += " with new notes";
        }
        if (req.body.tags && req.body.tags.length > 0) {
          activityContent += " with tags";
          updatedTags = Array.isArray(req.body.tags) 
            ? req.body.tags 
            : [req.body.tags];
        }
        
        // Create activity entry
        await storage.createActivity({
          bookmark_id: updatedBookmark.id,
          bookmark_title: updatedBookmark.title,
          user_id: userId,
          type: "bookmark_updated",
          content: activityContent,
          tags: updatedTags
        });
        
        res.json(updatedBookmark);
      } catch (error) {
        if (error.message === "Bookmark not found") {
          return res.status(404).json({ error: "Bookmark not found" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error updating bookmark:", error);
      res.status(500).json({ error: "Failed to update bookmark" });
    }
  });

  app.delete("/api/bookmarks/:id", async (req, res) => {
    try {
      // Use centralized bookmark service for deletion
      try {
        await bookmarkService.deleteBookmark(req.params.id);
        res.status(204).send();
      } catch (error) {
        if (error.message === "Bookmark not found") {
          return res.status(404).json({ error: "Bookmark not found" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      res.status(500).json({ error: "Failed to delete bookmark" });
    }
  });

  // Notes API endpoints
  app.get("/api/bookmarks/:bookmarkId/notes", async (req, res) => {
    try {
      const notes = await storage.getNotesByBookmarkId(req.params.bookmarkId);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve notes" });
    }
  });

  app.post("/api/bookmarks/:bookmarkId/notes", async (req, res) => {
    try {
      const parsedData = insertNoteSchema.safeParse({
        ...req.body,
        bookmark_id: req.params.bookmarkId
      });
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid note data", details: parsedData.error });
      }
      
      // Check if bookmark exists
      const bookmark = await storage.getBookmark(req.params.bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      const note = await storage.createNote(parsedData.data);
      
      // Create activity for note
      await storage.createActivity({
        bookmark_id: bookmark.id,
        bookmark_title: bookmark.title,
        type: "note_added",
        content: note.text,
        timestamp: new Date()
      });
      
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.delete("/api/notes/:id", async (req, res) => {
    try {
      await storage.deleteNote(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Highlights API endpoints
  app.get("/api/bookmarks/:bookmarkId/highlights", async (req, res) => {
    try {
      const highlights = await storage.getHighlightsByBookmarkId(req.params.bookmarkId);
      res.json(highlights);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve highlights" });
    }
  });

  app.post("/api/bookmarks/:bookmarkId/highlights", async (req, res) => {
    try {
      const parsedData = insertHighlightSchema.safeParse({
        ...req.body,
        bookmark_id: req.params.bookmarkId
      });
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid highlight data", details: parsedData.error });
      }
      
      // Check if bookmark exists
      const bookmark = await storage.getBookmark(req.params.bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      const highlight = await storage.createHighlight(parsedData.data);
      
      // Create activity for highlight
      await storage.createActivity({
        bookmark_id: bookmark.id,
        bookmark_title: bookmark.title,
        type: "highlight_added",
        content: highlight.quote,
        timestamp: new Date()
      });
      
      res.status(201).json(highlight);
    } catch (error) {
      res.status(500).json({ error: "Failed to create highlight" });
    }
  });

  app.delete("/api/highlights/:id", async (req, res) => {
    try {
      await storage.deleteHighlight(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete highlight" });
    }
  });

  // Screenshots API endpoints
  app.get("/api/bookmarks/:bookmarkId/screenshots", async (req, res) => {
    try {
      const screenshots = await storage.getScreenshotsByBookmarkId(req.params.bookmarkId);
      res.json(screenshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve screenshots" });
    }
  });

  app.post("/api/bookmarks/:bookmarkId/screenshots", async (req, res) => {
    try {
      const parsedData = insertScreenshotSchema.safeParse({
        ...req.body,
        bookmark_id: req.params.bookmarkId
      });
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid screenshot data", details: parsedData.error });
      }
      
      // Check if bookmark exists
      const bookmark = await storage.getBookmark(req.params.bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      const screenshot = await storage.createScreenshot(parsedData.data);
      res.status(201).json(screenshot);
    } catch (error) {
      res.status(500).json({ error: "Failed to create screenshot" });
    }
  });

  app.delete("/api/screenshots/:id", async (req, res) => {
    try {
      await storage.deleteScreenshot(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete screenshot" });
    }
  });

  // Insights API endpoints
  app.get("/api/bookmarks/:bookmarkId/insights", async (req, res) => {
    try {
      const insight = await storage.getInsightByBookmarkId(req.params.bookmarkId);
      
      if (!insight) {
        return res.status(404).json({ error: "Insight not found" });
      }
      
      res.json(insight);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve insight" });
    }
  });
  
  // Trigger AI processing for a bookmark
  app.post("/api/bookmarks/:id/process", async (req, res) => {
    try {
      const bookmarkId = req.params.id;
      
      // Get the bookmark first
      const bookmark = await storage.getBookmark(bookmarkId);
      if (!bookmark) {
        return res.status(404).json({ error: 'Bookmark not found' });
      }
      
      // Start AI processing in the background
      console.log(`Manually triggering AI processing for bookmark ${bookmarkId}`);
      
      // Set a processing flag on the bookmark
      await storage.updateBookmark(bookmarkId, {
        ai_processing_status: 'processing'
      });
      
      // Return immediately to client
      res.json({ 
        status: 'processing',
        message: 'AI processing started in the background'
      });
      
      // Start the AI processing
      bookmarkService.processAiBookmarkData(
        bookmarkId,
        bookmark.url,
        bookmark.content_html,
        req.body.insightDepth || 1
      ).then(async () => {
        // Update status flag when completed
        await storage.updateBookmark(bookmarkId, {
          ai_processing_status: 'completed'
        });
        console.log(`AI processing completed for bookmark ${bookmarkId}`);
      }).catch(async (error) => {
        // Update status flag on error
        await storage.updateBookmark(bookmarkId, {
          ai_processing_status: 'failed'
        });
        console.error(`AI processing failed for bookmark ${bookmarkId}:`, error);
      });
      
    } catch (error) {
      console.error('Error triggering AI processing:', error);
      res.status(500).json({ error: 'Failed to trigger AI processing' });
    }
  });

  // Activities API endpoints
  app.get("/api/activities", async (req, res) => {
    try {
      // If user is authenticated, filter activities by user_id
      if (req.isAuthenticated()) {
        const userId = req.user.id;
        const activities = await storage.getActivities(userId);
        console.log(`Retrieved ${activities.length} activities for user: ${userId}`);
        res.json(activities);
      } else {
        // For non-authenticated users, limit to the last 50 activities
        const activities = await storage.getActivities(undefined, 50);
        console.log(`Retrieved ${activities.length} public activities (limited to 50)`);
        res.json(activities);
      }
    } catch (error) {
      console.error("Error retrieving activities:", error);
      res.status(500).json({ error: "Failed to retrieve activities" });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      // Support both formats but ensure we're only using fields that exist in the DB
      const { type, content, action, details, bookmark_id, bookmark_title } = req.body;
      
      // Determine which field to use as the type
      const activityType = type || action;
      
      // Validate required fields
      if (!activityType) {
        return res.status(400).json({ error: "Activity type is required" });
      }
      
      // Create activity data compatible with the actual database schema
      const activityData: any = {
        // Use the type field (which exists in the DB)
        type: activityType,
        
        // Use the content field (which exists in the DB)
        content: content || details || null,
        
        // Default tags array
        tags: []
      };
      
      // Add optional fields if provided
      if (bookmark_id) {
        activityData.bookmark_id = bookmark_id;
      }
      
      if (bookmark_title) {
        activityData.bookmark_title = bookmark_title;
      }
      
      // Add user_id if authenticated
      if (req.isAuthenticated()) {
        activityData.user_id = req.user.id;
      }
      
      console.log("Creating activity:", activityData);
      const activity = await storage.createActivity(activityData);
      res.status(201).json(activity);
    } catch (error) {
      console.error("Error creating activity:", error);
      res.status(500).json({ error: "Failed to create activity" });
    }
  });

  // URL Processing endpoint for checking duplicates
  app.post("/api/url/normalize", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Get user ID if user is authenticated
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : null;
      
      // Use the bookmark service to process the URL
      // Pass the user ID to only check for duplicates for this specific user
      const urlResult = await bookmarkService.processUrl(url, userId);
      
      // Return the result directly from the service
      return res.json(urlResult);
    } catch (error) {
      console.error("Error normalizing URL:", error);
      res.status(500).json({ error: "Failed to normalize URL" });
    }
  });
  
  // Endpoint to check AI processing status
  app.get("/api/bookmarks/:id/processing-status", async (req, res) => {
    try {
      const bookmarkId = req.params.id;
      const bookmark = await storage.getBookmark(bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      // Check if insights exist for this bookmark
      const insight = await storage.getInsightByBookmarkId(bookmarkId);
      
      // Get AI-generated tags
      const allTags = await storage.getTagsByBookmarkId(bookmarkId);
      const systemTags = allTags.filter(tag => tag.type === 'system');
      
      const processingComplete = insight !== undefined || systemTags.length > 0;
      
      return res.json({
        bookmarkId,
        aiProcessingComplete: processingComplete,
        hasInsights: insight !== undefined,
        insightCount: insight ? 1 : 0,
        systemTagCount: systemTags.length
      });
    } catch (error) {
      console.error("Error checking AI processing status:", error);
      res.status(500).json({ error: "Failed to check AI processing status" });
    }
  });

  // AI Processing endpoints
  app.post("/api/embeddings", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }
      
      const embedding = await generateEmbedding(text);
      res.json(embedding);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate embedding" });
    }
  });

  app.post("/api/insights", async (req, res) => {
    try {
      const { url, content, depthLevel } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const insights = await generateInsights(url, content, depthLevel || 1);
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  app.post("/api/generate-tags", async (req, res) => {
    try {
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const tags = await generateTags(content);
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate tags" });
    }
  });

  app.post("/api/summarize", async (req, res) => {
    try {
      const { content } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const summary = await summarizeContent(content);
      res.json({ summary });
    } catch (error) {
      res.status(500).json({ error: "Failed to summarize content" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      console.log("Chat request received:", req.body);
      const { query, filters } = req.body;
      
      if (!query) {
        console.error("Missing query in chat request");
        return res.status(400).json({ error: "Query is required" });
      }
      
      // Validate that we have an API key
      if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "sk-dummy-key-for-development") {
        console.error("Missing or invalid OpenAI API key");
        return res.status(500).json({ error: "OpenAI API key is not configured" });
      }
      
      console.log("Processing chat request with filters:", filters);
      const response = await generateChatResponse(query, filters);
      console.log("Chat response generated successfully");
      res.json({ response });
    } catch (error) {
      console.error("Error processing chat request:", error);
      res.status(500).json({ error: "Failed to generate chat response", details: error.message });
    }
  });
  
  // Tags API endpoints
  app.get("/api/tags", async (req, res) => {
    try {
      // Get user ID if authenticated or undefined for non-authenticated users
      const userId = req.isAuthenticated() ? (req.user as Express.User).id : undefined;
      
      console.log(`Getting tags for ${userId ? `user ${userId}` : 'non-authenticated user'}`);
      
      // When not authenticated, we include tags from all available bookmarks 
      // This ensures we always show relevant tags based on what's visible on screen
      const tags = await storage.getTags(userId);
      
      console.log(`Retrieved ${tags.length} tags`);
      res.json(tags);
    } catch (error) {
      console.error("Error retrieving tags:", error);
      res.status(500).json({ error: "Failed to retrieve tags" });
    }
  });
  
  app.get("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.getTag(req.params.id);
      
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json(tag);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve tag" });
    }
  });
  
  app.post("/api/tags", async (req, res) => {
    try {
      console.log("Tag creation request body:", req.body);
      
      // Validate required fields
      if (!req.body || typeof req.body !== 'object') {
        console.error("Invalid tag creation request: missing or invalid body");
        return res.status(400).json({ error: "Invalid request body" });
      }
      
      // Get tag name with validation
      let tagName = req.body.name;
      if (!tagName || typeof tagName !== 'string' || tagName.trim() === '') {
        console.error("Invalid tag name:", tagName);
        return res.status(400).json({ error: "Tag name is required and must be a non-empty string" });
      }
      
      tagName = tagName.trim();
      
      // Apply tag normalization to ensure consistency
      // Import the tag normalizer function
      const { normalizeTag } = await import('./lib/tag-normalizer');
      const normalizedTagName = normalizeTag(tagName);
      
      console.log(`Normalized tag name: "${tagName}" -> "${normalizedTagName}"`);
      
      // Get tag type with validation
      let tagType: "user" | "system" = "user";
      if (req.body.type === "system") {
        tagType = "system";
      }
      
      // Create a tag data object with normalized name
      const tagData = {
        name: normalizedTagName,
        type: tagType
      };
      
      console.log("Creating tag with normalized data:", tagData);
      
      // Check if tag with same name already exists (case-insensitive)
      const existingTag = await storage.getTagByName(tagData.name);
      if (existingTag) {
        console.log("Tag already exists:", existingTag);
        return res.status(200).json(existingTag); // Return existing tag instead of error
      }
      
      // Create the tag
      const tag = await storage.createTag(tagData);
      console.log("Created new tag successfully:", tag);
      res.status(201).json(tag);
    } catch (error: any) {
      console.error("Tag creation error:", error);
      res.status(500).json({ error: "Failed to create tag: " + (error.message || "Unknown error") });
    }
  });
  
  app.patch("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.getTag(req.params.id);
      
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      // If updating the name, normalize it and check for duplicates
      if (req.body.name && req.body.name !== tag.name) {
        // Apply tag normalization to new name
        const { normalizeTag } = await import('./lib/tag-normalizer');
        const normalizedName = normalizeTag(req.body.name);
        
        console.log(`Normalized tag name for update: "${req.body.name}" -> "${normalizedName}"`);
        
        // Update the request with the normalized name
        req.body.name = normalizedName;
        
        // Check for duplicates using normalized name
        const existingTag = await storage.getTagByName(normalizedName);
        if (existingTag) {
          return res.status(409).json({ 
            error: "Tag with this name already exists", 
            existingTag 
          });
        }
      }
      
      const updatedTag = await storage.updateTag(req.params.id, req.body);
      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tag" });
    }
  });
  
  app.delete("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.getTag(req.params.id);
      
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      await storage.deleteTag(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });
  
  // BookmarkTags API endpoints
  app.get("/api/bookmarks/:bookmarkId/tags", async (req, res) => {
    try {
      const tags = await storage.getTagsByBookmarkId(req.params.bookmarkId);
      res.json(tags);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve tags for bookmark" });
    }
  });
  
  // New endpoint to get all bookmark tags in a single request
  app.get("/api/bookmarks-tags", async (req, res) => {
    try {
      // Extract bookmark IDs from query parameters if provided
      const bookmarkIds = req.query.ids ? (req.query.ids as string).split(",") : undefined;
      
      // Get all bookmark tags
      const bookmarkTagsMap = await storage.getAllBookmarkTags(bookmarkIds);
      res.json(bookmarkTagsMap);
    } catch (error) {
      console.error("Error retrieving all bookmark tags:", error);
      res.status(500).json({ error: "Failed to retrieve bookmark tags" });
    }
  });
  
  app.get("/api/tags/:tagId/bookmarks", async (req, res) => {
    try {
      const bookmarks = await storage.getBookmarksByTagId(req.params.tagId);
      res.json(bookmarks);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve bookmarks for tag" });
    }
  });
  
  app.post("/api/bookmarks/:bookmarkId/tags/:tagId", async (req, res) => {
    try {
      // Check if bookmark exists
      const bookmark = await storage.getBookmark(req.params.bookmarkId);
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      // Check if tag exists
      const tag = await storage.getTag(req.params.tagId);
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      const bookmarkTag = await storage.addTagToBookmark(req.params.bookmarkId, req.params.tagId);
      res.status(201).json(bookmarkTag);
    } catch (error) {
      res.status(500).json({ error: "Failed to add tag to bookmark" });
    }
  });
  
  app.delete("/api/bookmarks/:bookmarkId/tags/:tagId", async (req, res) => {
    try {
      const result = await storage.removeTagFromBookmark(req.params.bookmarkId, req.params.tagId);
      
      if (!result) {
        return res.status(404).json({ error: "Tag not found on this bookmark" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove tag from bookmark" });
    }
  });

  // Chat Sessions API endpoints
  app.get("/api/chat/sessions", async (req, res) => {
    try {
      // If user is authenticated, filter sessions by user_id
      if (req.isAuthenticated()) {
        const userId = req.user.id;
        const sessions = await storage.getChatSessions(userId);
        res.json(sessions);
      } else {
        // If not authenticated, return all sessions with null user_id
        const sessions = await storage.getChatSessions();
        res.json(sessions);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve chat sessions" });
    }
  });

  app.get("/api/chat/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve chat session" });
    }
  });

  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const parsedData = insertChatSessionSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ 
          error: "Invalid chat session data", 
          details: parsedData.error 
        });
      }
      
      // Add the user_id if the user is authenticated
      if (req.isAuthenticated()) {
        parsedData.data.user_id = req.user.id;
      }
      
      const session = await storage.createChatSession(parsedData.data);
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });

  app.patch("/api/chat/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }
      
      const updatedSession = await storage.updateChatSession(req.params.id, req.body);
      res.json(updatedSession);
    } catch (error) {
      res.status(500).json({ error: "Failed to update chat session" });
    }
  });

  app.delete("/api/chat/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getChatSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }
      
      await storage.deleteChatSession(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete chat session" });
    }
  });

  // Chat Messages API endpoints
  app.get("/api/chat/sessions/:sessionId/messages", async (req, res) => {
    try {
      const messages = await storage.getChatMessagesBySessionId(req.params.sessionId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve chat messages" });
    }
  });

  app.post("/api/chat/sessions/:sessionId/messages", async (req, res) => {
    try {
      // First verify the session exists
      const session = await storage.getChatSession(req.params.sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }
      
      const parsedData = insertChatMessageSchema.safeParse({
        ...req.body,
        session_id: req.params.sessionId
      });
      
      if (!parsedData.success) {
        return res.status(400).json({ 
          error: "Invalid chat message data", 
          details: parsedData.error 
        });
      }
      
      const message = await storage.createChatMessage(parsedData.data);
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to create chat message" });
    }
  });

  // AI Chat route for generating responses
  app.post("/api/chat/generate", async (req, res) => {
    try {
      const { message, filters, sessionId } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Generate a response from the AI
      const response = await generateChatResponse(message, filters);
      
      // If a session ID is provided, save the conversation
      if (sessionId) {
        // Get the user ID if authenticated
        const userId = req.isAuthenticated() ? req.user.id : null;
        
        // Save the user message
        await storage.createChatMessage({
          session_id: sessionId,
          content: message,
          role: "user"
        });
        
        // Save the AI response
        await storage.createChatMessage({
          session_id: sessionId,
          content: response,
          role: "assistant"
        });
        
        // Update session with filters if they were provided and user ID if authenticated
        const updateData: any = {};
        if (filters) {
          updateData.filters = filters;
        }
        
        // Only update user_id if the session doesn't already have one
        if (userId) {
          const session = await storage.getChatSession(sessionId);
          if (session && !session.user_id) {
            updateData.user_id = userId;
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          await storage.updateChatSession(sessionId, updateData);
        }
      }
      
      res.json({ response });
    } catch (error) {
      console.error("Error generating chat response:", error);
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  // Collections API endpoints
  app.get("/api/collections", async (req, res) => {
    try {
      // If user is authenticated, filter collections by user_id or public status
      let collections = [];
      if (req.isAuthenticated()) {
        const userId = (req.user as Express.User).id;
        // Get both the user's collections and any public collections
        collections = await storage.getCollections(userId);
      } else {
        // Only return public collections for unauthenticated users
        collections = await storage.getPublicCollections();
      }
      res.json(collections);
    } catch (error) {
      console.error("Error retrieving collections:", error);
      res.status(500).json({ error: "Failed to retrieve collections" });
    }
  });

  app.get("/api/collections/:id", async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.id);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      // Check if user can access this collection
      if (!req.isAuthenticated() && !collection.is_public) {
        return res.status(403).json({ error: "Access denied to private collection" });
      }

      // Get bookmarks in this collection
      const bookmarks = await storage.getBookmarksByCollectionId(collection.id);
      
      res.json({
        ...collection,
        bookmarks
      });
    } catch (error) {
      console.error("Error retrieving collection:", error);
      res.status(500).json({ error: "Failed to retrieve collection" });
    }
  });
  
  // Get bookmarks by collection ID with full details for graph visualization
  app.get("/api/collections/:id/graph", async (req, res) => {
    try {
      const collection = await storage.getCollection(req.params.id);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      // Check if user can access this collection
      if (!req.isAuthenticated() && !collection.is_public) {
        return res.status(403).json({ error: "Access denied to private collection" });
      }

      // Get bookmarks in this collection
      const bookmarks = await storage.getBookmarksByCollectionId(collection.id);
      
      if (bookmarks.length === 0) {
        return res.json([]);
      }
      
      // Get all bookmark IDs
      const bookmarkIds = bookmarks.map(bookmark => bookmark.id);
      
      // Get all bookmark tags in a single batch
      const bookmarkTagsMap = await storage.getAllBookmarkTags(bookmarkIds);
      
      // Populate the bookmarks with related data (same as /api/bookmarks endpoint)
      const populatedBookmarks = await Promise.all(
        bookmarks.map(async (bookmark) => {
          const notes = await storage.getNotesByBookmarkId(bookmark.id);
          const highlights = await storage.getHighlightsByBookmarkId(bookmark.id);
          const screenshots = await storage.getScreenshotsByBookmarkId(bookmark.id);
          const insights = await storage.getInsightByBookmarkId(bookmark.id);
          
          return {
            ...bookmark,
            notes,
            highlights,
            screenshots,
            insights,
            tags: bookmarkTagsMap[bookmark.id] || [] // Add tags from the batch query
          };
        })
      );

      res.json(populatedBookmarks);
    } catch (error) {
      console.error("Error retrieving collection bookmarks for graph:", error);
      res.status(500).json({ error: "Failed to retrieve collection bookmarks" });
    }
  });
  
  // Get bookmarks from multiple collections combined (for creating combined graph views)
  app.post("/api/collections/graph", async (req, res) => {
    try {
      // Check the request body for collection IDs
      const { collectionIds } = req.body;
      
      if (!collectionIds || !Array.isArray(collectionIds) || collectionIds.length === 0) {
        return res.status(400).json({ error: "Must provide an array of collection IDs" });
      }
      
      // Determine which collections the user can access
      const accessibleCollectionIds = [];
      for (const collectionId of collectionIds) {
        const collection = await storage.getCollection(collectionId);
        
        if (!collection) {
          continue; // Skip collections that don't exist
        }
        
        // Check if user can access this collection
        if (collection.is_public || (req.isAuthenticated() && collection.user_id === (req.user as Express.User).id)) {
          accessibleCollectionIds.push(collectionId);
        }
      }
      
      if (accessibleCollectionIds.length === 0) {
        return res.status(403).json({ error: "No accessible collections found" });
      }
      
      // Get all bookmarks from accessible collections
      const allBookmarks = new Map(); // Use a map to deduplicate bookmarks by ID
      
      for (const collectionId of accessibleCollectionIds) {
        const bookmarks = await storage.getBookmarksByCollectionId(collectionId);
        
        // Add each bookmark to the map, replacing any duplicates
        bookmarks.forEach(bookmark => {
          allBookmarks.set(bookmark.id, bookmark);
        });
      }
      
      // Convert the map values back to an array
      const uniqueBookmarks = Array.from(allBookmarks.values());
      
      if (uniqueBookmarks.length === 0) {
        return res.json([]);
      }
      
      // Get all bookmark IDs
      const bookmarkIds = uniqueBookmarks.map(bookmark => bookmark.id);
      
      // Get all bookmark tags in a single batch
      const bookmarkTagsMap = await storage.getAllBookmarkTags(bookmarkIds);
      
      // Populate the bookmarks with related data
      const populatedBookmarks = await Promise.all(
        uniqueBookmarks.map(async (bookmark) => {
          const notes = await storage.getNotesByBookmarkId(bookmark.id);
          const highlights = await storage.getHighlightsByBookmarkId(bookmark.id);
          const screenshots = await storage.getScreenshotsByBookmarkId(bookmark.id);
          const insights = await storage.getInsightByBookmarkId(bookmark.id);
          
          return {
            ...bookmark,
            notes,
            highlights,
            screenshots,
            insights,
            tags: bookmarkTagsMap[bookmark.id] || [] // Add tags from the batch query
          };
        })
      );

      res.json(populatedBookmarks);
    } catch (error) {
      console.error("Error retrieving multiple collection bookmarks for graph:", error);
      res.status(500).json({ error: "Failed to retrieve collection bookmarks" });
    }
  });

  app.post("/api/collections", async (req, res) => {
    try {
      // User must be authenticated to create a collection
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      
      const { name, description, is_public } = req.body;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: "Collection name is required" });
      }

      const collection = await storage.createCollection({
        name,
        description: description || "",
        user_id: userId,
        is_public: is_public === true || is_public === "true"
      });

      res.status(201).json(collection);
    } catch (error) {
      console.error("Error creating collection:", error);
      res.status(500).json({ error: "Failed to create collection" });
    }
  });

  app.put("/api/collections/:id", async (req, res) => {
    try {
      // User must be authenticated to update a collection
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const collectionId = req.params.id;
      
      // Get the collection to verify ownership
      const collection = await storage.getCollection(collectionId);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      // Check if user owns this collection
      if (collection.user_id !== userId) {
        return res.status(403).json({ error: "You can only update your own collections" });
      }
      
      const { name, description, is_public } = req.body;
      
      const updatedCollection = await storage.updateCollection(collectionId, {
        name,
        description,
        is_public
      });
      
      res.json(updatedCollection);
    } catch (error) {
      console.error("Error updating collection:", error);
      res.status(500).json({ error: "Failed to update collection" });
    }
  });

  app.delete("/api/collections/:id", async (req, res) => {
    try {
      // User must be authenticated to delete a collection
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const collectionId = req.params.id;
      
      // Get the collection to verify ownership
      const collection = await storage.getCollection(collectionId);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      // Check if user owns this collection
      if (collection.user_id !== userId) {
        return res.status(403).json({ error: "You can only delete your own collections" });
      }
      
      await storage.deleteCollection(collectionId);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting collection:", error);
      res.status(500).json({ error: "Failed to delete collection" });
    }
  });

  // Collection-Bookmark relationship API
  app.post("/api/collections/:collectionId/bookmarks/:bookmarkId", async (req, res) => {
    try {
      // User must be authenticated to add bookmarks to collections
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const { collectionId, bookmarkId } = req.params;
      
      // Verify the collection exists and user owns it
      const collection = await storage.getCollection(collectionId);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      if (collection.user_id !== userId) {
        return res.status(403).json({ error: "You can only add bookmarks to your own collections" });
      }
      
      // Verify the bookmark exists
      const bookmark = await storage.getBookmark(bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      const result = await storage.addBookmarkToCollection(collectionId, bookmarkId);
      
      res.status(201).json(result);
    } catch (error) {
      console.error("Error adding bookmark to collection:", error);
      res.status(500).json({ error: "Failed to add bookmark to collection" });
    }
  });

  app.delete("/api/collections/:collectionId/bookmarks/:bookmarkId", async (req, res) => {
    try {
      // User must be authenticated to remove bookmarks from collections
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const { collectionId, bookmarkId } = req.params;
      
      // Verify the collection exists and user owns it
      const collection = await storage.getCollection(collectionId);
      
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      
      if (collection.user_id !== userId) {
        return res.status(403).json({ error: "You can only remove bookmarks from your own collections" });
      }
      
      // Verify the bookmark exists in this collection first
      const collections = await storage.getCollectionsByBookmarkId(bookmarkId);
      const isInCollection = collections.some(c => c.id === collectionId);
      
      if (!isInCollection) {
        // If bookmark is not in this collection, still return success (idempotent)
        return res.status(204).send();
      }
      
      const success = await storage.removeBookmarkFromCollection(collectionId, bookmarkId);
      
      if (!success) {
        throw new Error("Failed to remove bookmark relationship from database");
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing bookmark from collection:", error);
      res.status(500).json({ error: "Failed to remove bookmark from collection" });
    }
  });
  
  // Settings API endpoints
  app.get("/api/settings", async (req, res) => {
    try {
      // If user is authenticated, filter settings by user_id
      if (req.isAuthenticated()) {
        const userId = req.user.id;
        const settings = await storage.getSettings(userId);
        res.json(settings);
      } else {
        // If not authenticated, return settings with null user_id
        const settings = await storage.getSettings();
        res.json(settings);
      }
    } catch (error) {
      console.error("Error retrieving settings:", error);
      res.status(500).json({ error: "Failed to retrieve settings" });
    }
  });
  
  // Endpoint to get the default prompts from raymmar's settings
  app.get("/api/settings/defaults", async (req, res) => {
    try {
      const RAYMMAR_USER_ID = 'c95a1d56-f721-4f9a-9104-7e4cf59caad7';
      const defaultSettings = await storage.getSettings(RAYMMAR_USER_ID);
      
      // Filter to just get the prompt settings
      const promptSettings = defaultSettings.filter(setting => 
        setting.key === 'auto_tagging_prompt' || 
        setting.key === 'summary_prompt' ||
        setting.key === 'bookmark_system_prompt'
      );
      
      res.json(promptSettings);
    } catch (error) {
      console.error("Error retrieving default settings:", error);
      res.status(500).json({ error: "Failed to retrieve default settings" });
    }
  });
  
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // If setting has a user_id, make sure only authorized users can access it
      if (setting.user_id && (!req.isAuthenticated() || setting.user_id !== req.user.id)) {
        return res.status(403).json({ error: "Unauthorized access to user setting" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error retrieving setting:", error);
      res.status(500).json({ error: "Failed to retrieve setting" });
    }
  });
  
  app.post("/api/settings", async (req, res) => {
    try {
      // Require authentication for creating settings
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const parsedData = insertSettingSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid setting data", details: parsedData.error });
      }
      
      // Add user_id from authenticated user
      parsedData.data.user_id = req.user.id;
      
      // Check if setting already exists
      const existingSetting = await storage.getSetting(parsedData.data.key);
      
      if (existingSetting) {
        // If the setting has a user_id, make sure it belongs to the current user
        if (existingSetting.user_id && existingSetting.user_id !== req.user.id) {
          return res.status(403).json({ error: "Cannot update another user's setting" });
        }
        
        // Update existing setting
        const updatedSetting = await storage.updateSetting(existingSetting.key, parsedData.data.value);
        return res.status(200).json(updatedSetting);
      }
      
      // Create new setting
      const newSetting = await storage.createSetting(parsedData.data);
      
      res.status(201).json(newSetting);
    } catch (error) {
      console.error("Error creating setting:", error);
      res.status(500).json({ error: "Failed to create setting" });
    }
  });
  
  app.patch("/api/settings/:key", async (req, res) => {
    try {
      // Require authentication for updating settings
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (!req.body.value) {
        return res.status(400).json({ error: "Missing value field in request body" });
      }
      
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // If the setting has a user_id, make sure it belongs to the current user
      if (setting.user_id && setting.user_id !== req.user.id) {
        return res.status(403).json({ error: "Cannot update another user's setting" });
      }
      
      const updatedSetting = await storage.updateSetting(req.params.key, req.body.value);
      res.json(updatedSetting);
    } catch (error) {
      console.error("Error updating setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });
  
  app.delete("/api/settings/:key", async (req, res) => {
    try {
      // Require authentication for deleting settings
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // If the setting has a user_id, make sure it belongs to the current user
      if (setting.user_id && setting.user_id !== req.user.id) {
        return res.status(403).json({ error: "Cannot delete another user's setting" });
      }
      
      await storage.deleteSetting(req.params.key);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting setting:", error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });

  // Get collections a bookmark belongs to
  app.get("/api/bookmarks/:bookmarkId/collections", async (req, res) => {
    try {
      const { bookmarkId } = req.params;
      
      // Check if bookmark exists
      const bookmark = await storage.getBookmark(bookmarkId);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      // Get collections for this bookmark
      const collections = await storage.getCollectionsByBookmarkId(bookmarkId);
      
      // Filter out private collections if user is not authenticated or not the owner
      const filteredCollections = collections.filter(collection => {
        if (collection.is_public) {
          return true;
        }
        
        if (req.isAuthenticated()) {
          return collection.user_id === (req.user as Express.User).id;
        }
        
        return false;
      });
      
      res.json(filteredCollections);
    } catch (error) {
      console.error("Error retrieving bookmark collections:", error);
      res.status(500).json({ error: "Failed to retrieve bookmark collections" });
    }
  });

  // X.com (Twitter) Integration Routes
  
  // Start X.com OAuth flow
  app.get("/api/x/auth", (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Generate authorization URL
      const authUrl = xService.getAuthorizationUrl();
      
      // Return the auth URL for frontend to redirect
      res.json({ authUrl });
    } catch (error) {
      console.error("Error starting X.com OAuth flow:", error);
      res.status(500).json({ error: "Failed to start X.com authentication" });
    }
  });
  
  // X.com OAuth callback handling
  app.post("/api/x/auth/callback", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log("X.com callback: User not authenticated");
        return res.status(401).json({ error: "Authentication required" });
      }
      
      console.log("X.com callback received:", req.body);
      const { code, codeVerifier, state } = req.body;
      
      if (!code) {
        console.log("X.com callback missing code parameter");
        return res.status(400).json({ error: "Missing authorization code" });
      }
      
      if (!codeVerifier) {
        console.log("X.com callback missing codeVerifier parameter");
        return res.status(400).json({ error: "Missing code verifier" });
      }
      
      // Exchange code for token
      const userId = (req.user as Express.User).id;
      console.log(`X.com callback: Exchanging code for token for user ${userId}`);
      console.log("Using state:", state || "state");
      
      // Using the fixed state value "state" if not provided from the client
      const credentials = await xService.exchangeCodeForToken(code, state || "state");
      
      console.log("X.com credentials obtained:", {
        accessToken: !!credentials.access_token,
        refreshToken: !!credentials.refresh_token,
        x_username: credentials.x_username,
        x_user_id: credentials.x_user_id
      });
      
      // Save credentials to database
      const savedCredentials = await storage.createXCredentials({
        ...credentials,
        user_id: userId
      });
      
      console.log("X.com credentials saved to database:", {
        id: savedCredentials.id,
        username: savedCredentials.x_username
      });
      
      res.json({ success: true, username: savedCredentials.x_username });
    } catch (error) {
      console.error("Error handling X.com OAuth callback:", error);
      if (error instanceof Error) {
        console.error("X.com callback error details:", error.message, error.stack);
      }
      res.status(500).json({ error: "Failed to complete X.com authentication" });
    }
  });
  
  // Check X.com connection status
  app.get("/api/x/status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as Express.User).id;
      const credentials = await storage.getXCredentialsByUserId(userId);
      
      if (!credentials) {
        return res.json({ connected: false });
      }
      
      // Return connection status with some user info
      res.json({
        connected: true,
        username: credentials.x_username,
        lastSync: credentials.last_sync_at
      });
    } catch (error) {
      console.error("Error checking X.com connection status:", error);
      res.status(500).json({ error: "Failed to check X.com connection status" });
    }
  });
  
  // Sync bookmarks from X.com
  app.post("/api/x/sync", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as Express.User).id;
      
      // Sync bookmarks using X service
      const syncResult = await xService.syncBookmarks(userId);
      
      res.json({
        success: true,
        ...syncResult
      });
    } catch (error) {
      console.error("Error syncing X.com bookmarks:", error);
      res.status(500).json({ error: "Failed to sync X.com bookmarks" });
    }
  });
  
  // Get X.com folders
  app.get("/api/x/folders", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as Express.User).id;
      
      // Get user credentials first
      const credentials = await storage.getXCredentialsByUserId(userId);
      
      if (!credentials) {
        return res.status(404).json({ error: "X.com connection not found" });
      }
      
      try {
        // Get folders from X.com - using user's UUID, not the x_user_id
        const folders = await xService.getFolders(credentials.access_token, userId);
        
        // Get existing folder mappings
        const existingMappings = await storage.getXFoldersByUserId(userId);
        
        // Combine data for response
        const foldersWithMappings = folders.map(folder => {
          const mapping = existingMappings.find(m => m.x_folder_id === folder.id);
          return {
            ...folder,
            collection_id: mapping?.collection_id || null,
            mapped: !!mapping
          };
        });
        
        res.json(foldersWithMappings);
      } catch (folderError) {
        console.error("Error retrieving X.com folders:", folderError);
        // Return empty array instead of error to avoid breaking the UI
        res.json([]);
      }
    } catch (error) {
      console.error("Error in X.com folders endpoint:", error);
      res.status(500).json({ error: "Failed to retrieve X.com folders" });
    }
  });
  
  // Map X.com folder to a collection
  app.post("/api/x/folders/map", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as Express.User).id;
      const { folderId, folderName, collectionId, createNew } = req.body;
      
      if (!folderId || !folderName) {
        return res.status(400).json({ error: "Missing required folder information" });
      }
      
      let result;
      
      // Create a new collection for this folder or map to existing one
      if (createNew) {
        result = await xService.createCollectionFromFolder(
          userId,
          { id: folderId, name: folderName }
        );
      } else {
        if (!collectionId) {
          return res.status(400).json({ error: "Collection ID is required when mapping to existing collection" });
        }
        
        result = await xService.mapFolderToCollection(
          userId,
          { id: folderId, name: folderName },
          collectionId
        );
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error mapping X.com folder:", error);
      res.status(500).json({ error: "Failed to map X.com folder" });
    }
  });

  return httpServer;
}
