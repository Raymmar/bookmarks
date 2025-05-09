/**
 * Report Service
 *
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { storage } from "../storage";
import { InsertReport, Report } from "@shared/schema";
import OpenAI from "openai";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format } from "date-fns";

// Define report status types
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are an expert curator, fact checker, and research assistant tasked with extracting trends, deep research and additional insights based on bookmarks being collected over a specific period of time.

Your task is to analyze the user's recently saved bookmarks and generate a comprehensive, well-structured report that provides valuable insights and finds connections between the content, themes and additional insights which can be extrcted by understanding them all in context at a high level. Your goal is not to regurgitate the individual bookmarks. Instea focus on how they relate to each other. Research the topics and create arguments for or against the bookmarks based on additional context that the user might not have considered. Fact check the bookmar, play devils advocate, point out logical fallacies and provide additional insights that follow themes and are derived from the submitted bookmarks. 

Follow these guidelines:
-Organize the bookmarks into logical sections and themes
-Identify key insights and highlight important concepts from across all subnitted bookmarks
-If content is related, point it out and explain why and how it is connected.
-Create a custom "newsletter" feel with sections that make the content digestible
-Use markdown formatting to create a beautiful, readable report
-Begin with an executive summary that highlights the main themes as bullets and then expand on each theme in the following sections. 
-Create a comprehensive thematic overview that captures ALL bookmark topics, even if there are many. You do not need to mention every bookmark individually, but you should link to relevant bookmarks when creating summaries and overviews as if you were stringing the report into a wikipedia style article about the related topic. 
-Always link back to the original content when mentioning bookmarks

Remember that you have access to the bookmark content, extracted insights, and associated tags. Use all this information to create a comprehensive report that summarizes the entirety of the user's content for the week.`;

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
    const { userId, customSystemPrompt, maxBookmarks = 100 } = options;

    // Default to the previous week if not specified
    const timePeriodEnd = options.timePeriodEnd || new Date();
    const timePeriodStart =
      options.timePeriodStart || subWeeks(timePeriodEnd, 1);

    // Format date range for the report title
    const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
    const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
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
        status: "generating" as ReportStatus,
      });

      // Store the report for the catch block
      reportObj = report;

      // Fetch bookmarks with insights and tags
      const bookmarksWithData = await storage.getBookmarksWithInsightsAndTags(
        userId,
        timePeriodStart,
        maxBookmarks,
      );

      if (bookmarksWithData.length === 0) {
        await storage.updateReport(report.id, {
          content: "No bookmarks found for this time period.",
          status: "completed",
        });
        return {
          ...report,
          content: "No bookmarks found for this time period.",
          status: "completed",
        };
      }

      // Add the bookmarks to the report for tracking
      for (const { bookmark } of bookmarksWithData) {
        await storage.addBookmarkToReport(report.id, bookmark.id);
      }

      // Prepare data for OpenAI
      const bookmarksData = bookmarksWithData.map(
        ({ bookmark, insight, tags }) => ({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description || "",
          date_saved: format(
            new Date(bookmark.date_saved),
            "yyyy-MM-dd HH:mm:ss",
          ),
          insight: insight
            ? {
                summary: insight.summary,
                sentiment: insight.sentiment,
              }
            : null,
          tags: tags.map((tag) => tag.name),
        }),
      );

      // Prepare the system prompt
      const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

      // Log the number of bookmarks being processed
      console.log(
        `Report generation: Processing ${bookmarksData.length} bookmarks for user ${userId}`,
      );

      // Log a sample of bookmark titles for debugging
      const sampleTitles = bookmarksData.slice(0, 5).map((b) => b.title);
      console.log(
        `Report generation: Sample bookmarks (first 5): ${sampleTitles.join(", ")}${bookmarksData.length > 5 ? "..." : ""}`,
      );

      // Enhanced user prompt to ensure comprehensive coverage
      const userPrompt = JSON.stringify({
        request:
          "Generate a comprehensive weekly insights report for my bookmarks",
        time_period: {
          start: format(timePeriodStart, "yyyy-MM-dd"),
          end: format(timePeriodEnd, "yyyy-MM-dd"),
        },
        instructions:
          "Provide a high level summary of all of the a high level overview all content themes and topics. Your goal is not to regurgitate the individual bookmarks, instead focus on extracing connections and themes. Patterns in the bookmarks and additional insights that might be useful for the user.",
        bookmarks: bookmarksData,
      });

      console.log(
        `Report generation: Sending request to OpenAI with ${userPrompt.length} characters`,
      );

      // Send to OpenAI for processing with increased token limits
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 6000, // Increased from 4000 to allow for longer, more detailed reports
      });

      // Get the generated report content
      const content =
        response.choices[0].message.content ||
        "Failed to generate report content";

      // Update the report with the generated content
      const updatedReport = await storage.updateReport(report.id, {
        content,
        status: "completed",
      });

      return updatedReport || report;
    } catch (error) {
      console.error("Error generating weekly report:", error);

      if (!reportObj) {
        // If we failed even before creating the report, return a minimal error response
        return {
          id: "",
          user_id: userId,
          title: reportTitle,
          content: "Error generating report",
          created_at: new Date(),
          updated_at: new Date(),
          time_period_start: timePeriodStart,
          time_period_end: timePeriodEnd,
          status: "failed" as ReportStatus,
        };
      }

      // Update the report with error status
      const failedReport = await storage.updateReportStatus(
        reportObj.id,
        "failed",
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
