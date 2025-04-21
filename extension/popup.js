// Global variables
let currentUrl = '';
let currentTitle = '';
let highlights = [];
let screenshots = [];
let activeScreenshotIndex = -1;

// Initialize the popup
document.addEventListener('DOMContentLoaded', () => {
  // Get current tab information
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    currentUrl = tab.url;
    currentTitle = tab.title;
    
    // Update UI with page info
    document.getElementById('page-title').textContent = currentTitle;
    document.getElementById('page-url').textContent = currentUrl;
  });
  
  // Set up event listeners
  document.getElementById('save-btn').addEventListener('click', saveBookmark);
  document.getElementById('cancel-btn').addEventListener('click', () => window.close());
  document.getElementById('add-highlight-btn').addEventListener('click', addHighlight);
  document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);
  document.getElementById('upload-image-btn').addEventListener('click', uploadImage);
  
  // Disable insight depth if auto-extract is not checked
  const autoExtractCheckbox = document.getElementById('auto-extract');
  const insightDepthSelect = document.getElementById('insight-depth');
  
  autoExtractCheckbox.addEventListener('change', () => {
    insightDepthSelect.disabled = !autoExtractCheckbox.checked;
  });
});

// Save the bookmark
function saveBookmark() {
  const tagsInput = document.getElementById('tags');
  const notesInput = document.getElementById('notes');
  const autoExtractCheckbox = document.getElementById('auto-extract');
  const insightDepthSelect = document.getElementById('insight-depth');
  
  // Get values from form
  const tags = tagsInput.value.split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
  
  const notes = notesInput.value.trim();
  const autoExtract = autoExtractCheckbox.checked;
  const insightDepth = parseInt(insightDepthSelect.value);
  
  // Create bookmark data
  const bookmarkData = {
    action: 'saveBookmark',
    tags,
    notes,
    autoExtract,
    insightDepth
  };
  
  // Send message to background script
  chrome.runtime.sendMessage(bookmarkData, (response) => {
    if (response && response.success) {
      let statusMessage = 'Bookmark saved successfully!';
      
      // Check if this was an existing bookmark with same normalized URL
      if (response.isExisting) {
        statusMessage = response.message || 'URL already exists in bookmarks!';
      }
      
      // Show success message
      showStatus('success', statusMessage);
      
      // Clear form
      tagsInput.value = '';
      notesInput.value = '';
      
      // Close popup after a delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      // Show error message
      showStatus('error', 'Failed to save bookmark: ' + (response ? response.error : 'Unknown error'));
    }
  });
}

// Add a highlight to the current page
function addHighlight() {
  // Send message to content script to get the current selection
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getSelection' }, (response) => {
      if (response && response.text) {
        // Add highlight to the list
        highlights.push({
          text: response.text,
          position: response.position
        });
        
        // Send message to content script to highlight the text
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'highlightText',
          text: response.text,
          position: response.position
        });
        
        // Update the UI
        updateHighlightsUI();
      } else {
        showStatus('error', 'No text selected. Please select text to highlight.');
      }
    });
  });
}

// Take a screenshot of the current page
function takeScreenshot() {
  chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
    if (response && response.success) {
      // Add screenshot to the list
      screenshots.push({
        dataUrl: response.dataUrl,
        timestamp: new Date().toISOString()
      });
      
      // Update the UI
      updateScreenshotsUI();
    } else {
      showStatus('error', 'Failed to capture screenshot');
    }
  });
}

// Upload an image
function uploadImage() {
  // Create a file input element
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  
  // Handle file selection
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    
    if (file) {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        // Add image to the list
        screenshots.push({
          dataUrl: e.target.result,
          timestamp: new Date().toISOString()
        });
        
        // Update the UI
        updateScreenshotsUI();
      };
      
      reader.readAsDataURL(file);
    }
  });
  
  // Trigger file selection
  fileInput.click();
}

// Update the highlights UI
function updateHighlightsUI() {
  const container = document.getElementById('highlights-container');
  
  // Clear the container
  container.innerHTML = '';
  
  if (highlights.length === 0) {
    // Show no highlights message
    container.innerHTML = '<div class="no-highlights">No highlights yet</div>';
    return;
  }
  
  // Add each highlight to the container
  highlights.forEach((highlight, index) => {
    const highlightElement = document.createElement('div');
    highlightElement.className = 'highlight-item';
    
    highlightElement.innerHTML = `
      <div class="highlight-text">"${highlight.text}"</div>
      <button class="remove-btn" data-index="${index}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    `;
    
    container.appendChild(highlightElement);
    
    // Add event listener for remove button
    highlightElement.querySelector('.remove-btn').addEventListener('click', () => {
      highlights.splice(index, 1);
      updateHighlightsUI();
    });
  });
}

// Update the screenshots UI
function updateScreenshotsUI() {
  const container = document.getElementById('screenshots-container');
  
  // Clear the container
  container.innerHTML = '';
  
  if (screenshots.length === 0) {
    // Show no screenshots message
    container.innerHTML = '<div class="no-screenshots">No images added</div>';
    return;
  }
  
  // Create screenshots gallery
  const gallery = document.createElement('div');
  gallery.className = 'screenshots-gallery';
  
  // Add each screenshot to the gallery
  screenshots.forEach((screenshot, index) => {
    const thumbnailElement = document.createElement('div');
    thumbnailElement.className = 'screenshot-thumbnail';
    thumbnailElement.style.backgroundImage = `url(${screenshot.dataUrl})`;
    
    // Add selected class if this is the active screenshot
    if (index === activeScreenshotIndex) {
      thumbnailElement.classList.add('selected');
    }
    
    // Add remove button
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-screenshot-btn';
    removeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    `;
    
    thumbnailElement.appendChild(removeButton);
    gallery.appendChild(thumbnailElement);
    
    // Add click event to select thumbnail
    thumbnailElement.addEventListener('click', (event) => {
      if (event.target !== removeButton && !removeButton.contains(event.target)) {
        activeScreenshotIndex = index;
        updateScreenshotsUI();
      }
    });
    
    // Add click event to remove button
    removeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      screenshots.splice(index, 1);
      
      if (activeScreenshotIndex === index) {
        activeScreenshotIndex = -1;
      } else if (activeScreenshotIndex > index) {
        activeScreenshotIndex--;
      }
      
      updateScreenshotsUI();
    });
  });
  
  container.appendChild(gallery);
  
  // Add preview if there's an active screenshot
  if (activeScreenshotIndex >= 0 && activeScreenshotIndex < screenshots.length) {
    const preview = document.createElement('div');
    preview.className = 'screenshot-preview';
    preview.style.backgroundImage = `url(${screenshots[activeScreenshotIndex].dataUrl})`;
    container.appendChild(preview);
  }
}

// Show status message
function showStatus(type, message) {
  // Create status element if it doesn't exist
  let statusElement = document.getElementById('status-message');
  
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'status-message';
    document.body.appendChild(statusElement);
  }
  
  // Set message type and text
  statusElement.className = `status-message ${type}`;
  statusElement.textContent = message;
  
  // Show the message
  statusElement.classList.add('visible');
  
  // Hide after a delay
  setTimeout(() => {
    statusElement.classList.remove('visible');
  }, 3000);
}
