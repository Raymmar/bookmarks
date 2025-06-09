/**
 * Report Service
 *
 * This service generates weekly insights reports by analyzing user bookmarks
 * and their associated tags and insights.
 */

import { Storage } from "../storage";
import { Report } from "@shared/schema";
import OpenAI from "openai";
import { subWeeks, format, subDays } from "date-fns";

// Define report status types
type ReportStatus = "generating" | "completed" | "failed";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default system prompt for report generation
const DEFAULT_SYSTEM_PROMPT = `You are a casual yet professional research assistant with a direct and straightforward tone.

Your job is to extract useful insights from bookmarks that have been collected by the user and turn them into an easily readable report with useful links back to the original content.

The report should be structured in two main sections:
"Digest"
"Overview"

- Digest: An informative list of key takeaways and analysis with links (formatted in markdown) back to the referenced bookmarks. Each point should be brief yet insightful. EVERY point must include at least one link to a relevant bookmark. This section should give the user a quick overview of the most important information with no added superlatives, adjectives or fluff. 

- Overview: A more detailed exploration of the content that dives deeper but as in a more readable format. Think news script, or briefing. Imagine this section might be read outloud as a audio segment on a podcast giving an overview of the insights from the report.

Your output should feel like a trusted advisor giving useful information rather than a formal business report. Use a casual, candid tone throughout but be direct and get straight to the point with no wasted words. Avoid being uptight, formal, or stiff in your language.

Follow these guidelines when creating your response:

- Use casual, everyday language - write like you're talking to a confidant.
- ALWAYS include links back to the original bookmarks when referencing specific content
- Every point in the Atmosphere section must have at least one link to a bookmark
- Organize content by themes but keep the structure simple and approachable. With related sections grouped together.
- Don't use executive summary, key insights, or other formal business report terminology
- Include useful analysis but present it in a conversational way
- Make connections between different bookmarks where relevant
- Don't skip any bookmarks - all should be referenced somewhere in the report
- Keep paragraphs short and readable

Follow these instructions for formatting:

- Use markdown formatting to create a casual, readable document
- Do not include the report dates in the title or header (or anywhere for that matter) in the report
- Make sure all source links are properly formatted as markdown links: [link text](https://example.com) 
- Use bold and italics sparingly to highlight important points
- Use bullet points in the Quick Links section for easy scanning

Remember you're writing for a casual reader who wants useful information presented in an approachable way - not a business executive looking for a formal report.`;

export interface GenerateReportOptions {
  userId: string;
  customSystemPrompt?: string;
  timePeriodStart?: Date;
  timePeriodEnd?: Date;
  maxBookmarks?: number;
  reportType?: "daily" | "weekly";
}

/**
 * Report Service for generating weekly insights
 */
export class ReportService {
  constructor(private readonly storage: Storage) {}

  /**
   * Generate a report for the user's recent bookmarks
   */
  async generateWeeklyReport(options: GenerateReportOptions): Promise<Report> {
    const {
      userId,
      customSystemPrompt,
      maxBookmarks = 100,
      reportType = "weekly",
    } = options;

    // Determine time period based on report type
    const timePeriodEnd = options.timePeriodEnd || new Date();
    let timePeriodStart: Date;

    if (reportType === "daily") {
      // For daily reports, get just the last day
      timePeriodStart = options.timePeriodStart || subDays(timePeriodEnd, 1);
    } else {
      // For weekly reports, get the last week
      timePeriodStart = options.timePeriodStart || subWeeks(timePeriodEnd, 1);
    }

    // Format date range for the report title
    const formattedStartDate = format(timePeriodStart, "MMM d, yyyy");
    const formattedEndDate = format(timePeriodEnd, "MMM d, yyyy");
    const reportTitle = `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${formattedStartDate} - ${formattedEndDate}`;

    try {
      // Create the report first with "generating" status
      const report = await this.storage.createReport({
        user_id: userId,
        title: reportTitle,
        content: "Generating report...",
        time_period_start: timePeriodStart,
        time_period_end: timePeriodEnd,
      });
      
      // Update the status after creation
      await this.storage.updateReportStatus(report.id, "generating");

      // Fetch bookmarks with insights and tags
      const bookmarksWithData = await this.storage.getBookmarksWithInsightsAndTags(
        userId,
        timePeriodStart,
        maxBookmarks,
      );

      if (bookmarksWithData.length === 0) {
        // Update the content
        await this.storage.updateReport(report.id, {
          content: "No bookmarks found for this time period.",
        });
        
        // Update the status separately
        await this.storage.updateReportStatus(report.id, "completed");
        
        // Return the updated report data
        return {
          ...report,
          content: "No bookmarks found for this time period.",
          status: "completed" as ReportStatus,
        };
      }

      // Add the bookmarks to the report for tracking
      for (const { bookmark } of bookmarksWithData) {
        await this.storage.addBookmarkToReport(report.id, bookmark.id);
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
        request: `Generate a comprehensive ${reportType} insights report for my bookmarks`,
        time_period: {
          start: format(timePeriodStart, "yyyy-MM-dd"),
          end: format(timePeriodEnd, "yyyy-MM-dd"),
          type: reportType,
        },
        instructions: `Use the attached system prompt to create a unified ${reportType} report. You're looking for patterns in the bookmarks and to provide additional insights by acting as a research assistant for the user.`,
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
        temperature: 0.6,
        max_tokens: 4000, // Increased from 4000 to allow for longer, more detailed reports
      });

      // Get the generated report content
      const content =
        response.choices[0].message.content ||
        "Failed to generate report content";

      console.log("Report generation: Content generated successfully. Generating descriptive title...");

      // Generate a descriptive title based on the report content
      const descriptiveTitle = await this.generateDescriptiveTitle(content, reportType, formattedStartDate, formattedEndDate);

      // Update the report content and title
      const updatedReport = await this.storage.updateReport(report.id, {
        content,
        title: descriptiveTitle, // Use the AI-generated title
      });
      
      // Update status separately
      await this.storage.updateReportStatus(report.id, "completed");

      return updatedReport || report;
    } catch (error) {
      console.error("Error generating weekly report:", error);

      try {
        // Try to create an error report if one doesn't already exist
        const errorReport = await this.storage.createReport({
          user_id: userId,
          title: reportTitle,
          content: "Error generating report",
          time_period_start: timePeriodStart,
          time_period_end: timePeriodEnd,
        });
        
        // Set status to failed
        await this.storage.updateReportStatus(errorReport.id, "failed");
        
        return errorReport;
      } catch (nestedError) {
        console.error("Failed to create error report:", nestedError);
        
        // Return a minimal object if we can't create an error report
        return {
          id: "",
          user_id: userId,
          title: reportTitle,
          content: "Error generating report",
          created_at: new Date().toISOString(),
          time_period_start: timePeriodStart instanceof Date ? timePeriodStart.toISOString() : timePeriodStart,
          time_period_end: timePeriodEnd instanceof Date ? timePeriodEnd.toISOString() : timePeriodEnd,
          status: "failed" as ReportStatus,
        } as unknown as Report;
      }
    }
  }

  /**
   * Get all reports for a user
   */
  async getReportsByUserId(userId: string): Promise<Report[]> {
    return await this.storage.getReportsByUserId(userId);
  }

  /**
   * Get a specific report by ID
   */
  async getReport(reportId: string): Promise<Report | undefined> {
    return await this.storage.getReport(reportId);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string): Promise<boolean> {
    return await this.storage.deleteReport(reportId);
  }

  /**
   * Update a report's content and/or title
   */
  async updateReport(reportId: string, updates: { title?: string; content?: string }): Promise<Report | undefined> {
    return await this.storage.updateReport(reportId, updates);
  }
  
  /**
   * Generate a descriptive title for a report based on its content
   * @param content The content of the report
   * @param reportType The type of report (daily or weekly)
   * @param startDate Formatted start date (as fallback)
   * @param endDate Formatted end date (as fallback)
   * @returns A descriptive title for the report
   */
  private async generateDescriptiveTitle(
    content: string, 
    reportType: string,
    startDate: string,
    endDate: string
  ): Promise<string> {
    // If there's no content, return the default title
    if (!content || content === "Generating report..." || content === "No bookmarks found for this time period.") {
      return `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${startDate} - ${endDate}`;
    }
    
    try {
      console.log("Generating descriptive title from report content");
      
      // Create a system prompt for title generation
      const systemPrompt = `You are an expert at creating compelling titles that cpture the context of a users submitted bookmarks and turning the related report into a short and impactful title.
The title should capture the main themes and insights from the report content in 6-10 words maximum.
DO NOT include the date range in the title.
DO NOT use generic phrases like "Weekly Digest" or "Content Roundup".
Instead, focus on the specific topics, themes, or takeaways in the report. Specifically trying to wrap it into something compelling that will entice others to click but not be hyperbolic.
The title should be engaging but professional, using sentence case capitalization.`;

      const contentSample = content.substring(0, 3000);
      
      // Create a user prompt
      const userPrompt = `Use the submitted content and the system prompt to create a title for this bookmark digest that is 6-10 words max:
      
${contentSample}

[...content continues...]

IMPORTANT: Return ONLY the title text. No quotes, explanations, or additional text.`;
      
      // Send to OpenAI for title generation
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
        temperature: 0.7, // Slightly higher temperature for creative titles
        max_tokens: 30,   // Short response needed
      });
      
      // Get the generated title
      let title = response.choices[0].message.content?.trim() || "";
      
      // Remove any quotes that might be in the response
      title = title.replace(/^["']|["']$/g, "");
      
      // Clean up any extra spaces
      title = title.replace(/\s+/g, " ").trim();
      
      console.log(`Generated title: "${title}"`);
      
      // If the AI didn't generate a valid title, fall back to the default
      if (!title) {
        return `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${startDate} - ${endDate}`;
      }
      
      return title;
    } catch (error) {
      console.error("Error generating descriptive title:", error);
      // Fall back to the default title format
      return `${reportType === "daily" ? "Daily" : "Weekly"} Insights: ${startDate} - ${endDate}`;
    }
  }
}

