import { useState, useEffect, useRef, useCallback } from 'react';
import TiptapEditor from './TiptapEditor';
import { Calendar, Save } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
  const [isEditing, setIsEditing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  
  // Refs for tracking state
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedTitleRef = useRef(report.title);
  const lastSavedContentRef = useRef(report.content);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Save report function
  const saveReport = useCallback(async (updates: { title?: string; content?: string }) => {
    if (!updates.title && !updates.content) return;
    
    // Don't save while user is actively editing
    if (isEditing) return;
    
    // Don't save if nothing has changed
    if (
      (updates.title && updates.title === lastSavedTitleRef.current) && 
      (updates.content && updates.content === lastSavedContentRef.current)
    ) return;
    
    setIsSaving(true);
    
    try {
      // Send the update to the API
      await apiRequest('PUT', `/api/reports/${report.id}`, updates);
      
      // Update refs to track what we've saved
      if (updates.title) lastSavedTitleRef.current = updates.title;
      if (updates.content) lastSavedContentRef.current = updates.content;
      
      // Set the last saved timestamp
      setLastSavedAt(new Date());
      
      // Invalidate the query cache
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      
      // Only show toast on first save
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
  }, [report.id, queryClient, lastSavedAt, toast, isEditing]);
  
  // Update local state when report changes from props
  useEffect(() => {
    // Only update if we're not actively editing
    if (!isEditing) {
      setTitle(report.title);
      setContent(report.content);
      lastSavedTitleRef.current = report.title;
      lastSavedContentRef.current = report.content;
    }
  }, [report.id, report.title, report.content, isEditing]);
  
  // Schedule a save for later
  const scheduleSave = useCallback(() => {
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule a new save for 2 seconds after editing stops
    saveTimeoutRef.current = setTimeout(() => {
      // Only save if not currently editing and content has changed
      if (!isEditing) {
        if (title !== lastSavedTitleRef.current) {
          saveReport({ title });
        }
        if (content !== lastSavedContentRef.current) {
          saveReport({ content });
        }
      }
      saveTimeoutRef.current = null;
    }, 2000);
  }, [title, content, saveReport, isEditing]);
  
  // Auto-resize textarea for title
  useEffect(() => {
    const resizeTextarea = () => {
      const textarea = titleInputRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      }
    };
    
    resizeTextarea();
  }, [title]);
  
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
  
  // Handle title changes
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
  };
  
  // Handle title focus
  const handleTitleFocus = () => {
    setIsEditing(true);
  };
  
  // Handle title blur
  const handleTitleBlur = () => {
    setIsEditing(false);
    
    // Only save if content has changed
    if (title !== lastSavedTitleRef.current) {
      scheduleSave();
    }
  };
  
  // Handle title keydown
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInputRef.current?.blur();
    }
  };
  
  // Handle content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  // Handle content focus
  const handleContentFocus = () => {
    setIsEditing(true);
  };
  
  // Handle content blur
  const handleContentBlur = () => {
    setIsEditing(false);
    
    // Only save if content has changed
    if (content !== lastSavedContentRef.current) {
      scheduleSave();
    }
  };
  
  // Save before unloading the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Cancel any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Immediately save any unsaved changes
      if (title !== lastSavedTitleRef.current) {
        saveReport({ title });
      }
      if (content !== lastSavedContentRef.current) {
        saveReport({ content });
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, saveReport]);
  
  return (
    <div className="p-6">
      <textarea
        ref={titleInputRef}
        className="text-2xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 -ml-2 resize-none overflow-hidden leading-tight"
        value={title}
        onChange={handleTitleChange}
        onFocus={handleTitleFocus}
        onBlur={handleTitleBlur}
        onKeyDown={handleTitleKeyDown}
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
        onFocus={handleContentFocus}
        onBlur={handleContentBlur}
        className="prose dark:prose-invert max-w-none"
        placeholder="Start typing your report..."
      />
    </div>
  );
};

export default EditableReport;