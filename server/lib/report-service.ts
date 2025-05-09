/**
 * Report Service
 * 
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { storage } from '../storage';
import { InsertReport, Report } from '@shared/schema';
import OpenAI from 'openai';
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format } from 'date-fns';

// Define report status types
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are an expert curator and analyst for Atmosphere, an AI-powered bookmark and content management platform.

Your task is to analyze the user's recently saved bookmarks and generate a comprehensive, well-structured weekly report that provides valuable insights and finds connections between the content.

Follow these guidelines:
1. Organize the bookmarks into logical sections and themes
2. Identify key insights and highlight important concepts from across bookmarks
3. Find connections between seemingly unrelated content
4. Create a custom "newsletter" feel with sections that make the content digestible
5. Use markdown formatting to create a beautiful, readable report
6. Begin with an executive summary that highlights the main themes
7. Include all bookmark titles and a brief summary for each
8. Always link back to the original content when mentioning bookmarks

Remember that you have access to the bookmark content, extracted insights, and associated tags. Use all this information to create a truly valuable report.`;

export interface GenerateReportOptions {
  userId: string;
  customSystemPrompt?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  maxBookmarks?: number;
}

/**
 * Report Service for generating weekly insights
 */
export class ReportService {
  constructor() {}

  /**
   * Generate a weekly report for the user's recent bookmarks
   */
  async generateWeeklyReport(options: GenerateReportOptions): Promise<Report> {
    const { 
      userId, 
      customSystemPrompt,
      maxBookmarks = 100
    } = options;

    // Default to the previous week if not specified
    const timePeriodEnd = options.timePeriodEnd || new Date();
    const timePeriodStart = options.timePeriodStart || subWeeks(timePeriodEnd, 1);

    // Format date range for the report title
    const formattedStartDate = format(timePeriodStart, 'MMM d, yyyy');
    const formattedEndDate = format(timePeriodEnd, 'MMM d, yyyy');
    const reportTitle = `Weekly Insights: ${formattedStartDate} - ${formattedEndDate}`;

    // Used to store the report for reference in the catch block
    let reportObj: Report;
    
    try {
      // Create the report first with "generating" status
      const report = await storage.createReport({
        user_id: userId,
        title: reportTitle,
        content: "Generating report...",
        time_period_start: timePeriodStart,
        time_period_end: timePeriodEnd,
        status: "generating" as ReportStatus
      });
      
      // Store the report for the catch block
      reportObj = report;

      // Fetch bookmarks with insights and tags
      const bookmarksWithData = await storage.getBookmarksWithInsightsAndTags(
        userId,
        timePeriodStart,
        maxBookmarks
      );

      if (bookmarksWithData.length === 0) {
        await storage.updateReport(report.id, {
          content: "No bookmarks found for this time period.",
          status: "completed"
        });
        return { ...report, content: "No bookmarks found for this time period.", status: "completed" };
      }

      // Add the bookmarks to the report for tracking
      for (const { bookmark } of bookmarksWithData) {
        await storage.addBookmarkToReport(report.id, bookmark.id);
      }

      // Prepare data for OpenAI
      const bookmarksData = bookmarksWithData.map(({ bookmark, insight, tags }) => ({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        description: bookmark.description || '',
        date_saved: format(new Date(bookmark.date_saved), 'yyyy-MM-dd HH:mm:ss'),
        insight: insight ? {
          summary: insight.summary,
          sentiment: insight.sentiment
        } : null,
        tags: tags.map(tag => tag.name)
      }));

      // Prepare the system prompt
      const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

      // Send to OpenAI for processing
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: JSON.stringify({
              request: "Generate a weekly insights report for my bookmarks",
              time_period: {
                start: format(timePeriodStart, 'yyyy-MM-dd'),
                end: format(timePeriodEnd, 'yyyy-MM-dd')
              },
              bookmarks: bookmarksData
            })
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      });

      // Get the generated report content
      const content = response.choices[0].message.content || "Failed to generate report content";

      // Update the report with the generated content
      const updatedReport = await storage.updateReport(report.id, {
        content,
        status: "completed"
      });

      return updatedReport || report;
    } catch (error) {
      console.error('Error generating weekly report:', error);
      
      if (!reportObj) {
        // If we failed even before creating the report, return a minimal error response
        return {
          id: '',
          user_id: userId,
          title: reportTitle,
          content: 'Error generating report',
          created_at: new Date(),
          updated_at: new Date(),
          time_period_start: timePeriodStart,
          time_period_end: timePeriodEnd,
          status: 'failed' as ReportStatus
        };
      }
      
      // Update the report with error status
      const failedReport = await storage.updateReportStatus(
        reportObj.id, 
        "failed"
      );
      
      return failedReport || reportObj;
    }
  }

  /**
   * Get all reports for a user
   */
  async getReportsByUserId(userId: string): Promise<Report[]> {
    return await storage.getReportsByUserId(userId);
  }

  /**
   * Get a specific report by ID
   */
  async getReport(reportId: string): Promise<Report | undefined> {
    return await storage.getReport(reportId);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    return await storage.deleteReport(reportId);
  }
}

// Export a singleton instance
export const reportService = new ReportService();