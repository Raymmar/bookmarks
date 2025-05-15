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

  // Refs to store the original values for comparison
  const originalTitleRef = useRef(report.title);
  const originalContentRef = useRef(report.content);
  const pendingSaveRef = useRef(false);
  
  // Update local state and refs when report changes from props
  useEffect(() => {
    setTitle(report.title);
    setContent(report.content);
    originalTitleRef.current = report.title;
    originalContentRef.current = report.content;
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
  
  // Debounced save functions with 3-second timeout
  const debouncedSaveContent = debounce((newContent: string) => {
    // Only save if content has actually changed
    if (newContent !== originalContentRef.current) {
      saveReport({ content: newContent });
      originalContentRef.current = newContent;
    }
  }, 3000); // 3 seconds - increased to reduce frequency of saves

  const debouncedSaveTitle = debounce((newTitle: string) => {
    // Only save if title has actually changed
    if (newTitle !== originalTitleRef.current && !pendingSaveRef.current) {
      pendingSaveRef.current = true;
      saveReport({ title: newTitle })
        .finally(() => {
          pendingSaveRef.current = false;
          originalTitleRef.current = newTitle;
        });
    }
  }, 3000); // 3 seconds - increased to match content debounce time

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    debouncedSaveContent(newContent);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    // Only trigger the debounced save if we're not already saving
    if (!pendingSaveRef.current) {
      debouncedSaveTitle(newTitle);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Cancel pending debounced saves
      debouncedSaveTitle.cancel();
      titleInputRef.current?.blur();
    }
  };
  
  const handleTitleBlur = () => {
    // Cancel any pending debounced saves
    debouncedSaveTitle.cancel();
    
    // Only save if the title has actually changed and we're not already in the process of saving
    if (title !== originalTitleRef.current && !pendingSaveRef.current) {
      pendingSaveRef.current = true;
      saveReport({ title })
        .finally(() => {
          pendingSaveRef.current = false;
          originalTitleRef.current = title;
        });
    }
  };
  
  // Add a beforeunload event handler to save any changes before leaving the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Cancel any pending debounced operations
      debouncedSaveTitle.cancel();
      debouncedSaveContent.cancel();
      
      // Save any pending changes before the page unloads
      if (title !== originalTitleRef.current && !pendingSaveRef.current) {
        saveReport({ title });
      }
      if (content !== originalContentRef.current) {
        saveReport({ content });
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [title, content, saveReport, debouncedSaveTitle, debouncedSaveContent]);

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
        className="prose dark:prose-invert max-w-none"
        placeholder="Start typing your report..."
      />
    </div>
  );
};

export default EditableReport;