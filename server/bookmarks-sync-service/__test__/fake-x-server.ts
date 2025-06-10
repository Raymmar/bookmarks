import express from 'express';
import { Server } from 'http';

/**
 * Fake X server for testing.
 * 
 * This server is used to test the bookmarks sync service.
 * 
 * Example usage:
 * 
 *     const xServer = new FakeXServer(3001);
 * 
 *     xServer.setUserBookmarks('123', 'testuser', [
 *       {
 *         id: '1',
 *         text: 'Test bookmark 1',
 *         created_at: '2024-01-01T00:00:00Z',
 *         author_id: '456',
 *         author_name: 'Test Author',
 *         author_username: 'testauthor',
 *       },
 *     ]);
 * 
 *     // Start the server
 *     xServer.start();
 * 
 */
export class FakeXServer {
  private app: express.Application;
  private server: Server | null = null;
  private users: Map<string, XUser> = new Map();
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware to parse JSON bodies
    this.app.use(express.json());

    // Middleware to simulate authentication
    this.app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'FakeXServer: Unauthorized' });
      }
      const token = authHeader.split(' ')[1];
      // In a real implementation, we would validate the token
      // For this fake server, we'll just use it as the user ID
      req.userId = token;
      next();
    });

    // GET /2/users/:id/bookmarks
    this.app.get('/2/users/:id/bookmarks', (req, res) => {
      console.log('FakeXServer: GET /2/users/:id/bookmarks', req.url);
      const userId = req.params.id;
      const user = this.users.get(userId);

      if (!user) {
        return res.status(404).json({ error: 'FakeXServer: User not found' });
      }

      const response: XBookmarksResponse = {
        data: user.bookmarks,
        meta: {
          result_count: user.bookmarks.length,
        },
      };

      res.json(response);
    });
  }

  /**
   * Configures bookmarks for a user.
   * 
   * Example:
   * 
   *     setUserBookmarks('123', 'testuser', [
   *       {
   *         id: '1',
   *         text: 'Test bookmark 1',
   *         created_at: '2024-01-01T00:00:00Z',
   *         author_id: '456',
   *         author_name: 'Test Author',
   *         author_username: 'testauthor',
   *       },
   *     ]);
   */ 
  public setUserBookmarks(userId: string, username: string, bookmarks: XBookmark[]) {
    this.users.set(userId, {
      id: userId,
      username,
      bookmarks,
    });
  }

  // Method to start the server
  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`Fake X server running on port ${this.port}`);
        resolve();
      });
    });
  }

  // Method to stop the server
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        this.server = null;
        resolve();
      });
    });
  }

  // Method to clear all configured users and bookmarks
  public clear() {
    this.users.clear();
  }
}

// Extend Express Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Types for X API responses
interface XBookmark {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_username: string;
  url?: string;
}

interface XBookmarksResponse {
  data: XBookmark[];
  meta: {
    result_count: number;
    next_token?: string;
  };
}

interface XUser {
  id: string;
  username: string;
  bookmarks: XBookmark[];
}