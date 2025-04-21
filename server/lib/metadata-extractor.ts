import fetch from "node-fetch";

interface Metadata {
  title: string;
  description: string;
  content: string;
  favicon?: string;
  author?: string;
  publishDate?: string;
}

/**
 * Extracts metadata from a URL
 * In a production environment, this would use proper HTML parsing
 * and more sophisticated extraction techniques
 */
export async function extractMetadata(url: string): Promise<Metadata> {
  try {
    // Fetch the page content
    const response = await fetch(url);
    const html = await response.text();
    
    // Basic regex-based extraction (not ideal but works for simple cases)
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : "Unknown Title";
    
    const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["'][^>]*>/i) || 
                             html.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']description["'][^>]*>/i);
    const description = descriptionMatch ? descriptionMatch[1] : "No description available";
    
    // Extract body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let content = bodyMatch ? bodyMatch[1] : "";
    
    // Extract main content if available (most modern sites use <main> or <article>)
    const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || 
                            html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                            html.match(/<div[^>]*(?:id|class)=['"](?:content|main|article)['"][^>]*>([\s\S]*?)<\/div>/i);
                            
    if (mainContentMatch) {
      content = mainContentMatch[1];
    }
    
    // Very basic cleaning of the content (in a real app, use a proper HTML parser)
    content = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove styles
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "") // Remove header
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "") // Remove footer
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "") // Remove navigation
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "") // Remove asides
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, ""); // Remove forms
      
    console.log(`Extracted content length: ${content.length} characters`);
    
    // Extract favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["'](.*?)["'][^>]*>/i) || 
                         html.match(/<link[^>]*href=["'](.*?)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i);
    const favicon = faviconMatch ? new URL(faviconMatch[1], url).href : undefined;
    
    // Extract author
    const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["'](.*?)["'][^>]*>/i) || 
                        html.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["']author["'][^>]*>/i);
    const author = authorMatch ? authorMatch[1] : undefined;
    
    // Extract publish date
    const publishDateMatch = html.match(/<meta[^>]*name=["'](?:pubdate|published|date)["'][^>]*content=["'](.*?)["'][^>]*>/i) || 
                             html.match(/<meta[^>]*content=["'](.*?)["'][^>]*name=["'](?:pubdate|published|date)["'][^>]*>/i);
    const publishDate = publishDateMatch ? publishDateMatch[1] : undefined;
    
    return {
      title,
      description,
      content,
      favicon,
      author,
      publishDate
    };
  } catch (error) {
    console.error("Error extracting metadata:", error);
    return {
      title: "Failed to extract title",
      description: "Failed to extract description",
      content: ""
    };
  }
}
