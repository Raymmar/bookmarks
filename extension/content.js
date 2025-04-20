// Store highlighted elements for reference
const highlightedElements = new Set();

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
  
  return true;
});

// Show a notification to the user
function showNotification(status, message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
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
  
  // Add keyboard shortcut for highlighting
  document.addEventListener('keydown', (event) => {
    // Alt+H for highlighting (matches the command in manifest)
    if (event.altKey && event.key === 'h') {
      highlightSelectedText();
    }
  });
}

// Run the initialization
initialize();
