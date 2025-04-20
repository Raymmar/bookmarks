// Store highlighted elements for reference
const highlightedElements = new Set();
let sidebarInjected = false;
let isSidebarOpen = false;

// Handle messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageInfo") {
    // Get the page content
    const content = document.documentElement.outerHTML;
    
    // Get meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc ? metaDesc.getAttribute('content') : '';
    
    sendResponse({ content, description });
  }
  
  else if (request.action === "getSelection") {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : '';
    
    // Get the selection's DOM position for future reference
    let position = null;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      position = {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      };
    }
    
    sendResponse({ text, position });
  }
  
  else if (request.action === "bookmarkSaved" || 
           request.action === "highlightSaved" || 
           request.action === "imageSaved" || 
           request.action === "noteSaved") {
    showNotification(request.status, request.message);
  }
  
  else if (request.action === "highlightText") {
    highlightSelectedText();
  }
  
  else if (request.action === "openSidebar") {
    if (!sidebarInjected) {
      injectSidebar();
    }
    openSidebar();
  }
  
  return true;
});

// Show a notification to the user
function showNotification(status, message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = isSidebarOpen ? '400px' : '20px';
  notification.style.padding = '10px 20px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '99999';
  notification.style.fontSize = '14px';
  notification.style.fontFamily = 'Inter, Arial, sans-serif';
  notification.style.transition = 'opacity 0.3s ease';
  
  if (status === 'success') {
    notification.style.backgroundColor = '#4F46E5';
    notification.style.color = 'white';
  } else {
    notification.style.backgroundColor = '#EF4444';
    notification.style.color = 'white';
  }
  
  notification.textContent = message;
  
  // Add to the page
  document.body.appendChild(notification);
  
  // Remove after a delay
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Inject the sidebar into the page
function injectSidebar() {
  // Create sidebar container
  const sidebar = document.createElement('div');
  sidebar.className = 'universal-bookmarks-sidebar';
  sidebar.id = 'universal-bookmarks-sidebar';
  
  // Create sidebar header
  const header = document.createElement('div');
  header.className = 'universal-bookmarks-sidebar-header';
  
  const headerLeft = document.createElement('div');
  headerLeft.className = 'universal-bookmarks-sidebar-header-left';
  
  const icon = document.createElement('div');
  icon.className = 'universal-bookmarks-sidebar-icon';
  icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  
  const title = document.createElement('h1');
  title.className = 'universal-bookmarks-sidebar-title';
  title.textContent = 'Universal Bookmarks';
  
  headerLeft.appendChild(icon);
  headerLeft.appendChild(title);
  
  const closeButton = document.createElement('button');
  closeButton.className = 'universal-bookmarks-sidebar-close';
  closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  closeButton.addEventListener('click', closeSidebar);
  
  header.appendChild(headerLeft);
  header.appendChild(closeButton);
  
  // Create content area
  const content = document.createElement('div');
  content.className = 'universal-bookmarks-sidebar-content';
  content.id = 'universal-bookmarks-sidebar-content';
  
  // Create footer
  const footer = document.createElement('div');
  footer.className = 'universal-bookmarks-sidebar-footer';
  
  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn btn-secondary';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', closeSidebar);
  
  const saveButton = document.createElement('button');
  saveButton.className = 'btn btn-primary';
  saveButton.textContent = 'Save Bookmark';
  saveButton.addEventListener('click', () => {
    // Send message to background script to save the current page
    chrome.runtime.sendMessage({ action: "saveCurrentPage" });
  });
  
  footer.appendChild(cancelButton);
  footer.appendChild(saveButton);
  
  // Assemble sidebar
  sidebar.appendChild(header);
  sidebar.appendChild(content);
  sidebar.appendChild(footer);
  
  // Create toggle button
  const toggleButton = document.createElement('button');
  toggleButton.className = 'universal-bookmarks-toggle';
  toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  toggleButton.addEventListener('click', toggleSidebar);
  
  // Inject sidebar and toggle button into page
  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);
  
  // Set flag
  sidebarInjected = true;
  
  // Load the sidebar content from popup.html
  chrome.runtime.sendMessage({ action: "getSidebarContent" }, (response) => {
    if (response && response.html) {
      content.innerHTML = response.html;
      
      // Initialize any scripts that need to run in the sidebar
      // This could be extracted from the popup.js
    }
  });
}

// Open the sidebar
function openSidebar() {
  if (!sidebarInjected) {
    injectSidebar();
  }
  
  const sidebar = document.getElementById('universal-bookmarks-sidebar');
  sidebar.classList.add('open');
  document.body.classList.add('universal-bookmarks-sidebar-open');
  isSidebarOpen = true;
}

// Close the sidebar
function closeSidebar() {
  const sidebar = document.getElementById('universal-bookmarks-sidebar');
  sidebar.classList.remove('open');
  document.body.classList.remove('universal-bookmarks-sidebar-open');
  isSidebarOpen = false;
}

// Toggle the sidebar open/closed
function toggleSidebar() {
  if (isSidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// Highlight selected text on the page
function highlightSelectedText() {
  const selection = window.getSelection();
  
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
    return;
  }
  
  const range = selection.getRangeAt(0);
  
  // Create the highlight span
  const highlightSpan = document.createElement('span');
  highlightSpan.className = 'universal-bookmark-highlight';
  highlightSpan.style.backgroundColor = 'rgba(79, 70, 229, 0.2)';
  highlightSpan.style.borderBottom = '2px solid #4F46E5';
  highlightSpan.style.cursor = 'pointer';
  highlightSpan.title = 'Highlighted by Universal Bookmarks';
  
  // Save the original content for reference
  const originalContent = range.toString();
  highlightSpan.dataset.originalContent = originalContent;
  
  // Apply the highlight
  range.surroundContents(highlightSpan);
  
  // Clear the selection
  selection.removeAllRanges();
  
  // Add to our set for tracking
  highlightedElements.add(highlightSpan);
  
  // Add click handler for the highlight
  highlightSpan.addEventListener('click', (event) => {
    // Show a tooltip or other UI
    const tooltip = document.createElement('div');
    tooltip.className = 'universal-bookmark-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.top = (event.pageY - 40) + 'px';
    tooltip.style.left = event.pageX + 'px';
    tooltip.style.backgroundColor = 'white';
    tooltip.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '8px';
    tooltip.style.zIndex = '99999';
    tooltip.style.fontSize = '14px';
    tooltip.style.fontFamily = 'Inter, Arial, sans-serif';
    
    tooltip.innerHTML = `
      <div style="margin-bottom: 8px;">Highlighted by Universal Bookmarks</div>
      <button class="remove-highlight" style="background-color: #EF4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 8px;">Remove</button>
      <button class="edit-note" style="background-color: #4F46E5; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Add Note</button>
    `;
    
    document.body.appendChild(tooltip);
    
    // Handle click outside the tooltip
    const handleClickOutside = (e) => {
      if (!tooltip.contains(e.target) && e.target !== highlightSpan) {
        tooltip.remove();
        document.removeEventListener('click', handleClickOutside);
      }
    };
    
    // Add click listener to the document
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    
    // Handle remove button click
    tooltip.querySelector('.remove-highlight').addEventListener('click', () => {
      // Remove the highlight span but keep the text
      const parent = highlightSpan.parentNode;
      while (highlightSpan.firstChild) {
        parent.insertBefore(highlightSpan.firstChild, highlightSpan);
      }
      parent.removeChild(highlightSpan);
      tooltip.remove();
      highlightedElements.delete(highlightSpan);
    });
    
    // Handle edit button click
    tooltip.querySelector('.edit-note').addEventListener('click', () => {
      tooltip.remove();
      
      // Show note input
      const noteInput = document.createElement('div');
      noteInput.className = 'universal-bookmark-note-input';
      noteInput.style.position = 'fixed';
      noteInput.style.top = '50%';
      noteInput.style.left = '50%';
      noteInput.style.transform = 'translate(-50%, -50%)';
      noteInput.style.backgroundColor = 'white';
      noteInput.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
      noteInput.style.borderRadius = '8px';
      noteInput.style.padding = '16px';
      noteInput.style.zIndex = '99999';
      noteInput.style.width = '300px';
      noteInput.style.fontFamily = 'Inter, Arial, sans-serif';
      
      noteInput.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 12px;">Add Note</div>
        <textarea style="width: 100%; padding: 8px; border: 1px solid #E5E7EB; border-radius: 4px; min-height: 100px; resize: vertical; margin-bottom: 12px;" placeholder="Add your thoughts about this highlight..."></textarea>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="cancel-note" style="background-color: transparent; border: 1px solid #E5E7EB; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button class="save-note" style="background-color: #4F46E5; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Save</button>
        </div>
      `;
      
      document.body.appendChild(noteInput);
      
      // Handle cancel button
      noteInput.querySelector('.cancel-note').addEventListener('click', () => {
        noteInput.remove();
      });
      
      // Handle save button
      noteInput.querySelector('.save-note').addEventListener('click', () => {
        const note = noteInput.querySelector('textarea').value;
        
        if (note.trim()) {
          // Save the note - in a real implementation, this would send to the background script
          console.log('Saving note:', note);
          highlightSpan.dataset.note = note;
          
          // Let the user know
          showNotification('success', 'Note saved');
        }
        
        noteInput.remove();
      });
    });
  });
}

// Initialize the content script
function initialize() {
  // Load the sidebar.css
  const sidebarStyle = document.createElement('link');
  sidebarStyle.rel = 'stylesheet';
  sidebarStyle.type = 'text/css';
  sidebarStyle.href = chrome.runtime.getURL('sidebar.css');
  document.head.appendChild(sidebarStyle);
  
  // Inject CSS for our elements
  const style = document.createElement('style');
  style.textContent = `
    .universal-bookmark-highlight:hover {
      background-color: rgba(79, 70, 229, 0.3) !important;
    }
    
    .universal-bookmark-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .universal-bookmark-modal {
      background-color: white;
      border-radius: 8px;
      padding: 24px;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 25px rgba(0, 0, 0, 0.1);
    }
  `;
  
  document.head.appendChild(style);
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    // Alt+H for highlighting (matches the command in manifest)
    if (event.altKey && event.key === 'h') {
      highlightSelectedText();
    }
    
    // Alt+B for toggling sidebar
    if (event.altKey && event.key === 'b') {
      toggleSidebar();
    }
  });
  
  // Inject the sidebar (but keep it closed by default)
  injectSidebar();
  closeSidebar();
}

// Run the initialization
initialize();
