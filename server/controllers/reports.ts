/**
 * Reports Controller
 * 
 * This controller handles report generation and retrieval.
 */

import type { Express, Request, Response } from "express";
import { reportService } from "../lib/report-service";
import { storage } from "../storage";
import { z } from "zod";
import { addWeeks, subWeeks } from "date-fns";

// Middleware to check if user is authenticated
const ensureAuthenticated = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

export function setupReportRoutes(app: Express) {
  // Generate a new weekly report
  app.post("/api/reports", ensureAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as Express.User).id;
      
      // Validate request body
      const requestSchema = z.object({
        customSystemPrompt: z.string().optional(),
        timePeriodStart: z.string().optional(), // ISO date string
        timePeriodEnd: z.string().optional(),   // ISO date string
        maxBookmarks: z.number().min(1).max(500).optional(),
      });
      
      const parseResult = requestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request body",
          errors: parseResult.error.errors
        });
      }
      
      const options = {
        userId,
        customSystemPrompt: parseResult.data.customSystemPrompt,
        timePeriodStart: parseResult.data.timePeriodStart ? new Date(parseResult.data.timePeriodStart) : undefined,
        timePeriodEnd: parseResult.data.timePeriodEnd ? new Date(parseResult.data.timePeriodEnd) : undefined,
        maxBookmarks: parseResult.data.maxBookmarks,
      };
      
      // Generate the report (this will be a long-running operation)
      const report = await reportService.generateWeeklyReport(options);
      
      res.status(201).json(report);
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });
  
  // Get all reports for the authenticated user
  app.get("/api/reports", ensureAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as Express.User).id;
      const reports = await reportService.getReportsByUserId(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error getting reports:", error);
      res.status(500).json({ message: "Failed to retrieve reports" });
    }
  });
  
  // Get a specific report by ID
  app.get("/api/reports/:reportId", ensureAuthenticated, async (req, res) => {
    try {
      const reportId = req.params.reportId;
      const report = await reportService.getReport(reportId);
      
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check if the report belongs to the authenticated user
      if (report.user_id !== (req.user as Express.User).id) {
        return res.status(403).json({ message: "Unauthorized access to report" });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error getting report:", error);
      res.status(500).json({ message: "Failed to retrieve report" });
    }
  });
  
  // Delete a report
  app.delete("/api/reports/:reportId", ensureAuthenticated, async (req, res) => {
    try {
      const reportId = req.params.reportId;
      const report = await reportService.getReport(reportId);
      
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check if the report belongs to the authenticated user
      if (report.user_id !== (req.user as Express.User).id) {
        return res.status(403).json({ message: "Unauthorized access to report" });
      }
      
      const deleted = await reportService.deleteReport(reportId);
      
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(500).json({ message: "Failed to delete report" });
      }
    } catch (error) {
      console.error("Error deleting report:", error);
      res.status(500).json({ message: "Failed to delete report" });
    }
  });
  
  // Get bookmarks associated with a report
  app.get("/api/reports/:reportId/bookmarks", ensureAuthenticated, async (req, res) => {
    try {
      const reportId = req.params.reportId;
      const report = await reportService.getReport(reportId);
      
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Check if the report belongs to the authenticated user
      if (report.user_id !== (req.user as Express.User).id) {
        return res.status(403).json({ message: "Unauthorized access to report" });
      }
      
      const bookmarks = await storage.getBookmarksByReportId(reportId);
      res.json(bookmarks);
    } catch (error) {
      console.error("Error getting report bookmarks:", error);
      res.status(500).json({ message: "Failed to retrieve report bookmarks" });
    }
  });
}