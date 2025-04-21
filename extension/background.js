// Configuration
const API_URL = "http://localhost:5000/api";

// Initialize context menu items
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu for saving the page
  chrome.contextMenus.create({
    id: "save-page",
    title: "Save to Universal Bookmarks",
    contexts: ["page"]
  });

  // Create context menu for highlighting text
  chrome.contextMenus.create({
    id: "save-highlight",
    title: "Save highlight to Universal Bookmarks",
    contexts: ["selection"]
  });

  // Create context menu for saving images
  chrome.contextMenus.create({
    id: "save-image",
    title: "Save image to Universal Bookmarks",
    contexts: ["image"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-page") {
    savePage(tab);
  } else if (info.menuItemId === "save-highlight") {
    saveHighlight(info.selectionText, tab);
  } else if (info.menuItemId === "save-image") {
    saveImage(info.srcUrl, tab);
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save_page") {
    savePage(tab);
  } else if (command === "highlight_text") {
    chrome.tabs.sendMessage(tab.id, { action: "getSelection" }, (response) => {
      if (response && response.text) {
        saveHighlight(response.text, tab);
      }
    });
  }
});

// Save the current page
function savePage(tab) {
  chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" }, async (response) => {
    if (!response) {
      console.error("Failed to get page info");
      return;
    }

    try {
      // First, check if the URL already exists in normalized form
      const urlCheckResponse = await fetch(`${API_URL}/url/normalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: tab.url })
      });

      if (!urlCheckResponse.ok) {
        throw new Error(`Failed to normalize URL: ${urlCheckResponse.status}`);
      }

      const urlData = await urlCheckResponse.json();
      console.log("URL check result:", urlData);

      // If URL exists, just show success message without creating duplicate
      if (urlData.exists) {
        console.log(`URL already exists as bookmark: ${urlData.existingBookmarkId}`);
        chrome.tabs.sendMessage(tab.id, { 
          action: "bookmarkSaved",
          status: "success",
          message: "Page already saved to Universal Bookmarks",
          existingBookmarkId: urlData.existingBookmarkId
        });
        return;
      }

      // If URL doesn't exist, create the bookmark with normalized URL
      const bookmarkData = {
        url: urlData.normalized, // Use the normalized URL
        title: tab.title,
        description: response.description || "",
        content_html: response.content || "",
        user_tags: [],
        system_tags: [],
        source: "extension",
        autoExtract: true,
        insightDepth: 1
      };

      const result = await fetch(`${API_URL}/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bookmarkData)
      });

      if (!result.ok) {
        throw new Error(`Failed to save bookmark: ${result.status}`);
      }

      const bookmarkResult = await result.json();

      // Notify the content script that the bookmark was saved
      chrome.tabs.sendMessage(tab.id, { 
        action: "bookmarkSaved",
        status: "success",
        message: "Page saved to Universal Bookmarks",
        bookmarkId: bookmarkResult.id
      });
    } catch (error) {
      console.error("Error saving bookmark:", error);
      chrome.tabs.sendMessage(tab.id, { 
        action: "bookmarkSaved",
        status: "error",
        message: "Failed to save bookmark"
      });
    }
  });
}

// Save a text highlight
async function saveHighlight(text, tab) {
  try {
    // First, check if the URL already exists in normalized form
    const urlCheckResponse = await fetch(`${API_URL}/url/normalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: tab.url })
    });

    if (!urlCheckResponse.ok) {
      throw new Error(`Failed to normalize URL: ${urlCheckResponse.status}`);
    }

    const urlData = await urlCheckResponse.json();
    console.log("URL check result for highlight:", urlData);
    
    let bookmarkId;
    
    // If URL exists, use that bookmark
    if (urlData.exists) {
      console.log(`URL already exists as bookmark: ${urlData.existingBookmarkId}`);
      bookmarkId = urlData.existingBookmarkId;
    } else {
      // If URL doesn't exist, create a new bookmark with normalized URL
      const bookmarkData = {
        url: urlData.normalized,
        title: tab.title,
        description: "",
        user_tags: [],
        system_tags: [],
        source: "extension"
      };
      
      const bookmarkResponse = await fetch(`${API_URL}/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bookmarkData)
      });
      
      if (!bookmarkResponse.ok) {
        throw new Error(`Failed to save bookmark: ${bookmarkResponse.status}`);
      }
      
      const bookmarkResult = await bookmarkResponse.json();
      bookmarkId = bookmarkResult.id;
    }
    
    // Now save the highlight
    const highlightData = {
      quote: text,
      position_selector: {}  // In a full implementation, this would contain location info
    };
    
    const highlightResponse = await fetch(`${API_URL}/bookmarks/${bookmarkId}/highlights`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(highlightData)
    });
    
    if (!highlightResponse.ok) {
      throw new Error(`Failed to save highlight: ${highlightResponse.status}`);
    }
    
    // Notify the content script
    chrome.tabs.sendMessage(tab.id, { 
      action: "highlightSaved",
      status: "success",
      message: "Highlight saved to Universal Bookmarks"
    });
  } catch (error) {
    console.error("Error saving highlight:", error);
    chrome.tabs.sendMessage(tab.id, { 
      action: "highlightSaved",
      status: "error",
      message: "Failed to save highlight"
    });
  }
}

// Save an image
async function saveImage(imageUrl, tab) {
  try {
    // First, check if the URL already exists in normalized form
    const urlCheckResponse = await fetch(`${API_URL}/url/normalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: tab.url })
    });

    if (!urlCheckResponse.ok) {
      throw new Error(`Failed to normalize URL: ${urlCheckResponse.status}`);
    }

    const urlData = await urlCheckResponse.json();
    console.log("URL check result for image:", urlData);
    
    let bookmarkId;
    
    // If URL exists, use that bookmark
    if (urlData.exists) {
      console.log(`URL already exists as bookmark: ${urlData.existingBookmarkId}`);
      bookmarkId = urlData.existingBookmarkId;
    } else {
      // If URL doesn't exist, create a new bookmark with normalized URL
      const bookmarkData = {
        url: urlData.normalized,
        title: tab.title,
        description: "",
        user_tags: [],
        system_tags: [],
        source: "extension"
      };
      
      const bookmarkResponse = await fetch(`${API_URL}/bookmarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bookmarkData)
      });
      
      if (!bookmarkResponse.ok) {
        throw new Error(`Failed to save bookmark: ${bookmarkResponse.status}`);
      }
      
      const bookmarkResult = await bookmarkResponse.json();
      bookmarkId = bookmarkResult.id;
    }
    
    // Now save the screenshot
    const screenshotData = {
      image_url: imageUrl
    };
    
    const screenshotResponse = await fetch(`${API_URL}/bookmarks/${bookmarkId}/screenshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(screenshotData)
    });
    
    if (!screenshotResponse.ok) {
      throw new Error(`Failed to save image: ${screenshotResponse.status}`);
    }
    
    // Notify the content script
    chrome.tabs.sendMessage(tab.id, { 
      action: "imageSaved",
      status: "success",
      message: "Image saved to Universal Bookmarks"
    });
  } catch (error) {
    console.error("Error saving image:", error);
    chrome.tabs.sendMessage(tab.id, { 
      action: "imageSaved",
      status: "error",
      message: "Failed to save image"
    });
  }
}

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveBookmark") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length > 0) {
        try {
          // First, check if the URL already exists in normalized form
          const urlCheckResponse = await fetch(`${API_URL}/url/normalize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ url: tabs[0].url })
          });

          if (!urlCheckResponse.ok) {
            throw new Error(`Failed to normalize URL: ${urlCheckResponse.status}`);
          }

          const urlData = await urlCheckResponse.json();
          console.log("URL check result for saveBookmark:", urlData);
          
          // If URL exists, return the existing bookmark instead of creating a duplicate
          if (urlData.exists) {
            console.log(`URL already exists as bookmark: ${urlData.existingBookmarkId}`);
            // Fetch the existing bookmark details to return
            const existingBookmarkResponse = await fetch(`${API_URL}/bookmarks/${urlData.existingBookmarkId}`);
            if (!existingBookmarkResponse.ok) {
              throw new Error(`Failed to fetch existing bookmark: ${existingBookmarkResponse.status}`);
            }
            
            const existingBookmark = await existingBookmarkResponse.json();
            
            // Return success with the existing bookmark
            sendResponse({ 
              success: true, 
              bookmark: existingBookmark,
              message: "URL already exists in bookmarks",
              isExisting: true
            });
            return;
          }
          
          // If URL doesn't exist, create a new bookmark with normalized URL
          const bookmarkData = {
            url: urlData.normalized, // Use the normalized URL
            title: tabs[0].title || "No Title",
            description: request.description || "",
            user_tags: request.tags || [],
            system_tags: [],
            source: "extension",
            notes: request.notes ? [{ text: request.notes }] : [],
            autoExtract: request.autoExtract || false,
            insightDepth: request.insightDepth || 1
          };

          const response = await fetch(`${API_URL}/bookmarks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(bookmarkData)
          });
          
          if (!response.ok) {
            throw new Error(`Failed to save bookmark: ${response.status}`);
          }
          
          const result = await response.json();
          sendResponse({ success: true, bookmark: result });
        } catch (error) {
          console.error("Error saving bookmark:", error);
          sendResponse({ success: false, error: error.message });
        }
      }
    });
    return true; // Keeps the message channel open for the async response
  }

  if (request.action === "captureScreenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, dataUrl => {
      sendResponse({ success: true, dataUrl: dataUrl });
    });
    return true; // Keeps the message channel open for the async response
  }
  
  if (request.action === "getSidebarContent") {
    // Send the popup HTML content to be used in the sidebar
    fetch(chrome.runtime.getURL("popup.html"))
      .then(response => response.text())
      .then(html => {
        // For security reasons, extensions can't just inject arbitrary HTML with scripts
        // We need to extract and modify the HTML to work within the sidebar
        // This is a simplified version - in production, you'd need more robust parsing

        // Extract the body content (simplified)
        const bodyContent = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        const content = bodyContent ? bodyContent[1] : html;
        
        // Send back the HTML content
        sendResponse({ html: content });
      })
      .catch(error => {
        console.error("Error fetching popup html:", error);
        sendResponse({ error: error.message });
      });
    return true; // Keeps the message channel open for the async response
  }
  
  if (request.action === "saveCurrentPage") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        savePage(tabs[0]);
      }
    });
    return true;
  }
  
  if (request.action === "openSidebar") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "openSidebar" });
      }
    });
  }
});
