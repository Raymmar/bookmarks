/**
 * Report Service
 *
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { storage } from "../storage";
import { InsertReport, Report } from "@shared/schema";
import OpenAI from "openai";
import { addWeeks, subWeeks, subDays, startOfWeek, endOfWeek, format } from "date-fns";

// Define report status types
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are an expert curator, fact checker, and research assistant tasked with extracting trends, deep research and additional insights based on bookmarks being collected over a specific period of time. You have access to the internet and your goal is to ingest the users bookmarks and provide additional insights based on what you find as you explore the users submissions. 

Your task is to analyze the user's submissions and generate a comprehensive, well-structured report that provides valuable insights and finds connections between the content, themes and additional insights which can be extrcted by understanding them all in context at a high level. 

Follow these guidelines:
-Research the submitted topics and create arguments for or against the bookmarks based on additional context that the user might not have considered.
-Fact check the bookmark, play devils advocate, point out logical fallacies and provide additional insights where possible based on your insights or even additional web research. 
-Organize your response into logical sections and themes. As if you were writing a wikipedia article summarizing the content with links and additional context.
-Create a custom "newsletter" feel with sections that make the content digestible
-Use markdown formatting to create a beautiful, readable report
-Begin the newsletter with an executive summary that gives an overview of the entire newsletter. Do not mention bookmarks in the summary.  
-Identify key insights and highlight important concepts from across all submitted bookmarks as part of the executive summary as a bullet list. 
-If content is related, point it out and explain why and how it is connected.
-The summary should not mention bookmarks. Just write it as an intro to the content with additional context and compelling narrative about what is included in the report. Do not use the word "bookmarks" in the summary. just weave a story. 
-Do not just list out the bookmarks. Instead, create a narrative that ties all of the bookmarks together. Do not use adjecties or fancy words. Just be clear and concise.
-Create a comprehensive thematic overview that captures ALL bookmarks and topics, even if there are many. Include links and references to as many of them as possible. 
-If a bookmark does not fit into one of the high level themes, include it in a misc section that includes other bookmarks which do not fit into our core hight level topics. 
-Write the report as if you were stringing the report into a wikipedia style article about the related topic. 
-Always link back to the original content when mentioning bookmarks with a [source] link.
-Include all themes and topics in your report. Do not skip any bookmarks or topics.

Remember that you have access to the bookmark content, extracted insights, and associated tags. Use all this information to create a comprehensive report that summarizes the entirety of the user's content for the week.`;

export interface GenerateReportOptions {
  userId: string;
  customSystemPrompt?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  maxBookmarks?: number;
  reportType?: 'daily' | 'weekly';
  readingLength?: 'quick' | 'default' | 'deep';
  maxTokens?: number;
  temperature?: number;
}

/**
 * Report Service for generating weekly insights
 */
export class ReportService {
  constructor() {}

  /**
   * Generate a report for the user's recent bookmarks
   */
  async generateWeeklyReport(options: GenerateReportOptions): Promise<Report> {
    const { 
      userId, 
      customSystemPrompt, 
      maxBookmarks = 100, 
      reportType = 'weekly',
      readingLength = 'default',
      maxTokens,
      temperature
    } = options;

    // Determine time period based on report type
    const timePeriodEnd = options.timePeriodEnd || new Date();
    let timePeriodStart: Date;
    
    if (reportType === 'daily') {
      // For daily reports, get just the last day
      timePeriodStart = options.timePeriodStart || subDays(timePeriodEnd, 1);
    } else {
      // For weekly reports, get the last week
      timePeriodStart = options.timePeriodStart || subWeeks(timePeriodEnd, 1);
    }

    // Format date range for the report title
    const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
    const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
    const reportTitle = `${reportType === 'daily' ? 'Daily' : 'Weekly'} Insights: ${formattedStartDate} - ${formattedEndDate}`;

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
          `Generate a comprehensive ${reportType} insights report for my bookmarks`,
        time_period: {
          start: format(timePeriodStart, "yyyy-MM-dd"),
          end: format(timePeriodEnd, "yyyy-MM-dd"),
          type: reportType
        },
        instructions:
          `Provide a high level summary of all of the submitted content, themes and topics for this ${reportType} report. Your goal is not to regurgitate the individual bookmarks, instead focus on extracting connections and themes. Patterns in the bookmarks and additional insights that might be useful for the user.`,
        bookmarks: bookmarksData,
      });

      console.log(
        `Report generation: Sending request to OpenAI with ${userPrompt.length} characters`,
      );

      // Set default values for reading length
      let finalMaxTokens = 4500;  // Default value
      let finalTemperature = 0.6; // Default value
      
      // Use provided values or determine based on reading length
      if (maxTokens !== undefined) {
        finalMaxTokens = maxTokens;
      } else {
        // Set based on reading length
        switch (readingLength) {
          case 'quick':
            finalMaxTokens = 2000;
            finalTemperature = 0.5;
            break;
          case 'default':
            finalMaxTokens = 4500;
            finalTemperature = 0.6;
            break;
          case 'deep':
            finalMaxTokens = 8000;
            finalTemperature = 0.7;
            break;
        }
      }
      
      // Use provided temperature if specified
      if (temperature !== undefined) {
        finalTemperature = temperature;
      }
      
      // Log reading length settings
      console.log(
        `Report generation: Using reading length ${readingLength} with max_tokens=${finalMaxTokens}, temperature=${finalTemperature}`
      );
      
      // Send to OpenAI for processing with configured parameters
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
        temperature: finalTemperature,
        max_tokens: finalMaxTokens,
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
