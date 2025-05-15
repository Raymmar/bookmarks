import { useState, useEffect, useRef, useCallback } from 'react';
import TiptapEditor from './TiptapEditor';
import { Calendar, Save } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { debounce } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface EditableReportProps {
  report: {
    id: string;
    title: string;
    content: string;
    time_period_start: string | Date;
    time_period_end: string | Date;
    user_id: string;
    created_at: string;
    status: 'generating' | 'completed' | 'failed';
  };
  dateRange: string; // This is now the created_at date formatted as a string
}

const EditableReport = ({ report, dateRange }: EditableReportProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(report.title);
  const [content, setContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Use useCallback to memoize the saveReport function to prevent unnecessary re-renders
  const saveReport = useCallback(async (updates: { title?: string; content?: string }) => {
    if (!updates.title && !updates.content) return;

    setIsSaving(true);
    try {
      // Send the update to the API
      await apiRequest('PUT', `/api/reports/${report.id}`, updates);
      
      // Set the last saved timestamp
      setLastSavedAt(new Date());
      
      // Invalidate the report queries to ensure we get fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${report.id}`] });
      
      // Only show the success toast the first time in a session
      if (!lastSavedAt) {
        toast({
          title: 'Report saved',
          description: 'Your changes have been saved successfully.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        title: 'Error saving report',
        description: 'There was a problem saving your changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [report.id, queryClient, lastSavedAt, toast]);

  // Track the last saved content for comparison
  const lastSavedTitle = useRef(report.title);
  const lastSavedContent = useRef(report.content);
  
  // Auto-save timer reference
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Flag to track if content has changed since last save
  const [contentChanged, setContentChanged] = useState(false);
  
  // Update local state when report changes from props
  useEffect(() => {
    setTitle(report.title);
    setContent(report.content);
    lastSavedTitle.current = report.title;
    lastSavedContent.current = report.content;
  }, [report.id, report.title, report.content]);
  
  // Auto-resize textarea for title
  useEffect(() => {
    const resizeTextarea = () => {
      const textarea = titleInputRef.current;
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        // Set the height to match the content
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };
    
    // Resize when component mounts and when title changes
    resizeTextarea();
  }, [title]);

  // Set up regular interval auto-save
  useEffect(() => {
    // Function to check and save changes
    const checkAndSaveChanges = () => {
      let hasChanges = false;
      const changes: {title?: string; content?: string} = {};
      
      if (title !== lastSavedTitle.current) {
        changes.title = title;
        hasChanges = true;
      }
      
      if (content !== lastSavedContent.current) {
        changes.content = content;
        hasChanges = true;
      }
      
      if (hasChanges) {
        setIsSaving(true);
        saveReport(changes)
          .then(() => {
            // Update the last saved values
            if (changes.title) lastSavedTitle.current = title;
            if (changes.content) lastSavedContent.current = content;
            setContentChanged(false);
          })
          .finally(() => {
            setIsSaving(false);
          });
      }
    };
    
    // Set up interval for auto-save - check every 5 seconds
    autoSaveTimerRef.current = setInterval(() => {
      if (contentChanged) {
        checkAndSaveChanges();
      }
    }, 5000);
    
    // Clean up interval on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [title, content, saveReport, contentChanged]);

  // Format the last saved time for display
  const getLastSavedText = () => {
    if (!lastSavedAt) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSavedAt.getTime();
    const diffSec = Math.round(diffMs / 1000);
    
    if (diffSec < 60) {
      return `Saved ${diffSec} seconds ago`;
    }
    
    const diffMin = Math.round(diffSec / 60);
    return `Saved ${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  };

  // Function to save immediately
  const saveImmediately = () => {
    if (title !== lastSavedTitle.current || content !== lastSavedContent.current) {
      const changes: {title?: string; content?: string} = {};
      
      if (title !== lastSavedTitle.current) {
        changes.title = title;
      }
      
      if (content !== lastSavedContent.current) {
        changes.content = content;
      }
      
      setIsSaving(true);
      saveReport(changes)
        .then(() => {
          // Update the last saved values
          if (changes.title) lastSavedTitle.current = title;
          if (changes.content) lastSavedContent.current = content;
          setContentChanged(false);
        })
        .finally(() => {
          setIsSaving(false);
        });
    }
  };

  // Handle content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setContentChanged(true);
  };

  // Simple change handler for title - only updates state
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setContentChanged(true);
  };

  // Handle Enter key to blur the title input
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInputRef.current?.blur();
    }
  };
  
  // Save title immediately when the title field loses focus
  const handleTitleBlur = () => {
    saveImmediately();
  };
  
  // Save content immediately when the editor loses focus
  const handleContentBlur = () => {
    saveImmediately();
  };
  
  // Add a beforeunload event handler to save any changes before leaving the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save any pending changes immediately before the page unloads
      if (contentChanged) {
        saveImmediately();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [contentChanged]);

  return (
    <div className="p-6">
      <textarea
        ref={titleInputRef}
        className="text-2xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 -ml-2 resize-none overflow-hidden leading-tight"
        value={title}
        onChange={handleTitleChange}
        onKeyDown={handleTitleKeyDown}
        onBlur={handleTitleBlur}
        placeholder="Enter report title..."
        rows={1}
        style={{ 
          minHeight: "2.5rem", 
          height: "auto",
          lineHeight: "1.2", 
          whiteSpace: "pre-wrap",
          wordBreak: "break-word" 
        }}
      />
      <div className="text-sm text-gray-500 mb-6 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" /> 
          {dateRange}
        </div>
        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="text-xs italic flex items-center">
              <Save className="w-3 h-3 mr-1 animate-pulse" />
              Saving...
            </span>
          ) : isTyping ? (
            <span className="text-xs italic flex items-center">
              <span className="w-3 h-3 mr-1 flex">
                <span className="animate-pulse relative flex h-2 w-2 mt-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                </span>
              </span>
              Editing...
            </span>
          ) : lastSavedAt ? (
            <span className="text-xs italic">
              {getLastSavedText()}
            </span>
          ) : null}
        </div>
      </div>
      
      <TiptapEditor 
        content={content} 
        onChange={handleContentChange}
        onBlur={handleContentBlur}
        className="prose dark:prose-invert max-w-none"
        placeholder="Start typing your report..."
      />
    </div>
  );
};

export default EditableReport;