import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { extractMetadata } from "./lib/metadata-extractor";
import { processContent, generateEmbedding, generateInsights, generateTags, summarizeContent, generateChatResponse } from "./lib/content-processor";
import { z } from "zod";
import { 
  insertBookmarkSchema, insertNoteSchema, insertHighlightSchema, 
  insertScreenshotSchema, insertInsightSchema, insertActivitySchema,
  insertTagSchema, insertBookmarkTagSchema, 
  insertChatSessionSchema, insertChatMessageSchema, insertSettingSchema
} from "@shared/schema";
import { normalizeUrl, areUrlsEquivalent } from "@shared/url-service";
import { bookmarkService } from "./lib/bookmark-service";

// WebSocket client tracker
interface WebSocketClient {
  socket: WebSocket;
  isAlive: boolean;
}

// Map to track active WebSocket connections
const webSocketClients = new Map<string, WebSocketClient>();

// Function to broadcast messages to all connected clients
function broadcastToAll(message: any) {
  const messageStr = JSON.stringify(message);
  webSocketClients.forEach((client) => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(messageStr);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Set up WebSocket server on the same HTTP server as Express
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws' // Use a distinct path so it doesn't conflict with Vite's HMR websocket
  });

  // Set up WebSocket connection handling
  wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(2, 15);
    console.log(`WebSocket client connected: ${clientId}`);
    
    webSocketClients.set(clientId, { socket: ws, isAlive: true });
    
    // Handle client messages (we don't expect many, but good to handle)
    ws.on('message', (message) => {
      try {
        // If we ever want to handle client messages in the future
        const parsedMessage = JSON.parse(message.toString());
        console.log('Received message:', parsedMessage);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      console.log(`WebSocket client disconnected: ${clientId}`);
      webSocketClients.delete(clientId);
    });
    
    // Set up ping-pong to detect dead connections
    ws.on('pong', () => {
      const client = webSocketClients.get(clientId);
      if (client) {
        client.isAlive = true;
      }
    });
    
    // Send a welcome message
    ws.send(JSON.stringify({ 
      type: 'connection', 
      message: 'Connected to Universal Bookmarks WebSocket server' 
    }));
  });
  
  // Set up interval to ping clients and clean up dead connections
  const pingInterval = setInterval(() => {
    webSocketClients.forEach((client, id) => {
      if (!client.isAlive) {
        client.socket.terminate();
        webSocketClients.delete(id);
        return;
      }
      
      client.isAlive = false;
      client.socket.ping();
    });
  }, 30000); // Check every 30 seconds
  
  // Clean up interval on server close
  wss.on('close', () => {
    clearInterval(pingInterval);
  });
  
  // Override the bookmarkService's processAiBookmarkData method to add WebSocket notifications
  const originalProcessAiBookmarkData = bookmarkService.processAiBookmarkData.bind(bookmarkService);
  bookmarkService.processAiBookmarkData = async (bookmarkId, url, content_html, insightDepth) => {
    // Notify clients that AI processing is starting
    broadcastToAll({
      type: 'ai_processing_started',
      bookmarkId,
      timestamp: new Date(),
      message: 'AI processing started'
    });
    
    try {
      // Call the original method
      await originalProcessAiBookmarkData(bookmarkId, url, content_html, insightDepth);
      
      // Notify clients that AI processing is complete
      broadcastToAll({
        type: 'ai_processing_completed',
        bookmarkId,
        timestamp: new Date(),
        message: 'AI processing completed successfully'
      });
    } catch (error) {
      // Notify clients of errors
      broadcastToAll({
        type: 'ai_processing_error',
        bookmarkId,
        timestamp: new Date(),
        message: `AI processing error: ${error.message}`
      });
      
      // Re-throw to preserve original error handling
      throw error;
    }
  };

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
      
      // Log full request body for debugging
      console.log("Creating bookmark with request body:", JSON.stringify(req.body, null, 2));
      
      // Use centralized bookmark service for creation with all processing
      const result = await bookmarkService.createBookmark({
        url: bookmarkData.url,
        title: bookmarkData.title,
        description: bookmarkData.description,
        content_html: bookmarkData.content_html,
        notes: req.body.notes ? (Array.isArray(req.body.notes) ? req.body.notes[0]?.text : req.body.notes) : undefined,
        tags: req.body.tags || bookmarkData.user_tags || [], // Get tags from req.body.tags first, then fall back to legacy user_tags
        autoExtract: req.body.autoExtract === true || req.body.autoExtract === "true", // Ensure boolean conversion
        insightDepth: req.body.insightDepth ? parseInt(req.body.insightDepth) : 1, // Ensure numeric
        source: bookmarkData.source || 'web'
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
          tags: req.body.tags || req.body.user_tags || [], // Check tags first, then legacy user_tags
          source: req.body.source
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

  // Activities API endpoints
  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getActivities();
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve activities" });
    }
  });

  // URL Processing endpoint for checking duplicates
  app.post("/api/url/normalize", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Use the bookmark service to process the URL
      const urlResult = await bookmarkService.processUrl(url);
      
      // Return the result directly from the service
      return res.json(urlResult);
    } catch (error) {
      console.error("Error normalizing URL:", error);
      res.status(500).json({ error: "Failed to normalize URL" });
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
      
      // Get tag type with validation
      let tagType: "user" | "system" = "user";
      if (req.body.type === "system") {
        tagType = "system";
      }
      
      // Create a tag data object
      const tagData = {
        name: tagName,
        type: tagType
      };
      
      console.log("Creating tag with data:", tagData);
      
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

  // Chat Sessions API endpoints
  app.get("/api/chat/sessions", async (req, res) => {
    try {
      const sessions = await storage.getChatSessions();
      res.json(sessions);
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
        
        // Update session with filters if they were provided
        if (filters) {
          await storage.updateChatSession(sessionId, { filters });
        }
      }
      
      res.json({ response });
    } catch (error) {
      console.error("Error generating chat response:", error);
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  // Settings API endpoints
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error retrieving settings:", error);
      res.status(500).json({ error: "Failed to retrieve settings" });
    }
  });
  
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error retrieving setting:", error);
      res.status(500).json({ error: "Failed to retrieve setting" });
    }
  });
  
  app.post("/api/settings", async (req, res) => {
    try {
      const parsedData = insertSettingSchema.safeParse(req.body);
      
      if (!parsedData.success) {
        return res.status(400).json({ error: "Invalid setting data", details: parsedData.error });
      }
      
      // Check if setting already exists
      const existingSetting = await storage.getSetting(parsedData.data.key);
      
      if (existingSetting) {
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
      if (!req.body.value) {
        return res.status(400).json({ error: "Missing value field in request body" });
      }
      
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
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
      const setting = await storage.getSetting(req.params.key);
      
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      await storage.deleteSetting(req.params.key);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting setting:", error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });

  return httpServer;
}
