import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractMetadata } from "./lib/metadata-extractor";
import { processContent, generateEmbedding, generateInsights, generateTags, summarizeContent, generateChatResponse } from "./lib/content-processor";
import { z } from "zod";
import { 
  insertBookmarkSchema, insertNoteSchema, insertHighlightSchema, 
  insertScreenshotSchema, insertInsightSchema, insertActivitySchema,
  insertTagSchema, insertBookmarkTagSchema 
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);

  // Bookmarks API endpoints
  app.get("/api/bookmarks", async (req, res) => {
    try {
      const bookmarks = await storage.getBookmarks();
      
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
      
      // Extract metadata if URL is provided but no title/description
      if (bookmarkData.url && (!bookmarkData.title || !bookmarkData.description)) {
        try {
          const metadata = await extractMetadata(bookmarkData.url);
          bookmarkData.title = bookmarkData.title || metadata.title;
          bookmarkData.description = bookmarkData.description || metadata.description;
          bookmarkData.content_html = metadata.content;
        } catch (error) {
          console.error("Error extracting metadata:", error);
          // Continue with available data
        }
      }
      
      // Process content if auto-extract is enabled
      if (req.body.autoExtract && bookmarkData.content_html) {
        try {
          const processedContent = await processContent(bookmarkData.content_html);
          
          // Generate embedding for search
          const embedding = await generateEmbedding(processedContent.text);
          
          // Generate auto tags if not provided
          if (!bookmarkData.system_tags || bookmarkData.system_tags.length === 0) {
            const tags = await generateTags(processedContent.text);
            bookmarkData.system_tags = tags;
          }
          
          // Create bookmark with proper date
          const bookmark = await storage.createBookmark({
            ...bookmarkData,
            vector_embedding: embedding.embedding,
            date_saved: new Date()
          });
          
          // Generate insights based on content
          if (req.body.insightDepth) {
            const insightDepth = parseInt(req.body.insightDepth);
            const insights = await generateInsights(
              bookmarkData.url,
              processedContent.text,
              insightDepth
            );
            
            // Store insights
            await storage.createInsight({
              bookmark_id: bookmark.id,
              summary: insights.summary,
              sentiment: insights.sentiment,
              depth_level: insightDepth,
              related_links: insights.relatedLinks || []
            });
            
            // Create activity for insight generation
            await storage.createActivity({
              bookmark_id: bookmark.id,
              bookmark_title: bookmark.title,
              type: "insight_generated",
              tags: insights.tags,
              timestamp: new Date()
            });
          }
          
          // Create activity for bookmark
          await storage.createActivity({
            bookmark_id: bookmark.id,
            bookmark_title: bookmark.title,
            type: "bookmark_added",
            timestamp: new Date()
          });
          
          // Add notes if provided
          if (req.body.notes && Array.isArray(req.body.notes)) {
            for (const noteData of req.body.notes) {
              if (noteData.text) {
                const note = await storage.createNote({
                  bookmark_id: bookmark.id,
                  text: noteData.text,
                  timestamp: new Date()
                });
                
                // Create activity for note
                await storage.createActivity({
                  bookmark_id: bookmark.id,
                  bookmark_title: bookmark.title,
                  type: "note_added",
                  content: noteData.text,
                  timestamp: new Date()
                });
              }
            }
          }
          
          res.status(201).json(bookmark);
        } catch (error) {
          console.error("Error processing content:", error);
          // Continue with basic bookmark creation
          const bookmark = await storage.createBookmark({
            ...bookmarkData,
            date_saved: new Date()
          });
          
          await storage.createActivity({
            bookmark_id: bookmark.id,
            bookmark_title: bookmark.title,
            type: "bookmark_added",
            timestamp: new Date()
          });
          
          res.status(201).json(bookmark);
        }
      } else {
        // Basic bookmark creation without processing
        // Ensure date_saved is a proper Date object
        const bookmarkWithDate = {
          ...bookmarkData,
          date_saved: new Date()
        };
        
        const bookmark = await storage.createBookmark(bookmarkWithDate);
        
        await storage.createActivity({
          bookmark_id: bookmark.id,
          bookmark_title: bookmark.title,
          type: "bookmark_added",
          timestamp: new Date()
        });
        
        res.status(201).json(bookmark);
      }
    } catch (error) {
      console.error("Error creating bookmark:", error);
      res.status(500).json({ error: "Failed to create bookmark" });
    }
  });

  app.patch("/api/bookmarks/:id", async (req, res) => {
    try {
      const bookmark = await storage.getBookmark(req.params.id);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      const updatedBookmark = await storage.updateBookmark(req.params.id, req.body);
      res.json(updatedBookmark);
    } catch (error) {
      res.status(500).json({ error: "Failed to update bookmark" });
    }
  });

  app.delete("/api/bookmarks/:id", async (req, res) => {
    try {
      const bookmark = await storage.getBookmark(req.params.id);
      
      if (!bookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }
      
      await storage.deleteBookmark(req.params.id);
      res.status(204).send();
    } catch (error) {
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

  // Activities API endpoints
  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getActivities();
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve activities" });
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

  app.post("/api/tags", async (req, res) => {
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
      const { query, filters } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }
      
      const response = await generateChatResponse(query, filters);
      res.json({ response });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });
  
  // Tags API endpoints
  app.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getTags();
      res.json(tags);
    } catch (error) {
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
      const parsedData = insertTagSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid tag data", details: parsedData.error });
      }
      
      // Check if tag with same name already exists
      const existingTag = await storage.getTagByName(parsedData.data.name);
      if (existingTag) {
        return res.status(409).json({ 
          error: "Tag already exists", 
          existingTag 
        });
      }
      
      const tag = await storage.createTag(parsedData.data);
      res.status(201).json(tag);
    } catch (error) {
      res.status(500).json({ error: "Failed to create tag" });
    }
  });
  
  app.patch("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.getTag(req.params.id);
      
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      // If updating the name, check for duplicates
      if (req.body.name && req.body.name !== tag.name) {
        const existingTag = await storage.getTagByName(req.body.name);
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

  return httpServer;
}
