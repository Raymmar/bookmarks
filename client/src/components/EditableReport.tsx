import { useState, useEffect, useRef, useCallback } from 'react';
import TiptapEditor from './TiptapEditor';
import { Calendar, Save, Share, MoreHorizontal, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';

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
  onDelete?: () => void; // Callback for after successful deletion
}

const EditableReport = ({ report, dateRange, onDelete }: EditableReportProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(report.title);
  const [content, setContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Handle publishing the report
  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      // First save any pending changes
      const changes: { title?: string; content?: string } = {};
      if (title !== lastSavedTitleRef.current) changes.title = title;
      if (content !== lastSavedContentRef.current) changes.content = content;
      
      if (Object.keys(changes).length > 0) {
        await saveReport(changes);
      }
      
      // Then publish the report (stub for now)
      toast({
        title: "Report published",
        description: "Your report is now available for viewing.",
      });
    } catch (error) {
      console.error('Error publishing report:', error);
      toast({
        title: "Publishing failed",
        description: "There was a problem publishing your report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };
  
  // Handle deleting the report
  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      // Optimistically update the cache
      queryClient.setQueriesData(
        { queryKey: ['/api/reports'] },
        (old: any) => {
          if (Array.isArray(old)) {
            return old.filter(r => r.id !== report.id);
          }
          return old;
        }
      );
      
      // Perform the actual delete
      await apiRequest('DELETE', `/api/reports/${report.id}`);
      
      // Invalidate queries but don't refetch immediately
      queryClient.invalidateQueries({
        queryKey: ['/api/reports'],
        refetchType: 'none'
      });
      
      toast({
        title: "Report deleted",
        description: "Your report has been permanently deleted.",
      });
      
      // Call onDelete callback if provided
      if (onDelete) {
        onDelete();
      }
      
    } catch (error) {
      console.error('Error deleting report:', error);
      
      // Revert optimistic update
      queryClient.invalidateQueries({
        queryKey: ['/api/reports'],
        refetchType: 'active'
      });
      
      toast({
        title: "Deletion failed",
        description: "There was a problem deleting your report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };
  
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
    
    // Already store optimistically in state before saving
    if (updates.title) lastSavedTitleRef.current = updates.title;
    if (updates.content) lastSavedContentRef.current = updates.content;
    
    setIsSaving(true);
    
    try {
      // Send the update to the API
      await apiRequest('PUT', `/api/reports/${report.id}`, updates);
      
      // Set the last saved timestamp
      setLastSavedAt(new Date());
      
      // Invalidate the query cache, but don't immediately refetch
      // This prevents the UI from flickering with the old data
      queryClient.invalidateQueries({ 
        queryKey: ['/api/reports'],
        refetchType: 'none'
      });
      
      // Only show toast on first save in a session
      if (!lastSavedAt) {
        toast({
          title: 'Report saved',
          description: 'Your changes have been saved successfully.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error saving report:', error);
      
      // Revert the optimistic update on error
      if (updates.title) lastSavedTitleRef.current = report.title;
      if (updates.content) lastSavedContentRef.current = report.content;
      
      toast({
        title: 'Error saving report',
        description: 'There was a problem saving your changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [report.id, queryClient, lastSavedAt, toast, isEditing, report.title, report.content]);
  
  // Prevent immediate content updates after edit
  const ignorePropsUpdatesRef = useRef(false);
  
  // Update the ignoring state in a separate effect
  useEffect(() => {
    if (isEditing) {
      ignorePropsUpdatesRef.current = true;
    } else {
      // When editing stops, continue ignoring for a brief period to prevent flicker
      const timeout = setTimeout(() => {
        ignorePropsUpdatesRef.current = false;
      }, 1500); // Longer than the TiptapEditor's ignoreExternalUpdates timeout
      
      return () => clearTimeout(timeout);
    }
  }, [isEditing]);
  
  // Update local state when report changes from props
  useEffect(() => {
    // Only update if we're not ignoring updates
    if (!ignorePropsUpdatesRef.current) {
      setTitle(report.title);
      setContent(report.content);
      
      // Important: Always update the lastSaved refs when a new report is loaded
      // This prevents saving on report changes but allows saving of actual user edits
      lastSavedTitleRef.current = report.title;
      lastSavedContentRef.current = report.content;
      
      // Reset the last saved timestamp when switching reports
      setLastSavedAt(null);
    }
  }, [report.id, report.title, report.content]);
  
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
    
    // Only save if title has changed
    if (title !== lastSavedTitleRef.current) {
      // Save immediately instead of scheduling
      saveReport({ title });
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
      // Save immediately instead of scheduling
      saveReport({ content });
    }
  };
  
  // Save before unloading the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Cancel any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Check if user made changes by comparing with the last saved values
      // This ensures we save user edits but avoid unnecessary saves on page refresh
      const hasUnsavedChanges = 
        title !== lastSavedTitleRef.current || 
        content !== lastSavedContentRef.current;
      
      if (hasUnsavedChanges) {
        // Prepare changes object with all unsaved changes at once
        const changes: { title?: string; content?: string } = {};
        
        if (title !== lastSavedTitleRef.current) {
          changes.title = title;
        }
        
        if (content !== lastSavedContentRef.current) {
          changes.content = content;
        }
        
        // Only save if there are actual changes
        if (Object.keys(changes).length > 0) {
          saveReport(changes);
        }
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Clear any pending save timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
          // Check if user made changes by comparing with the last saved values
      // This ensures we save user edits but avoid unnecessary saves on report switching
      const hasUnsavedChanges = 
        title !== lastSavedTitleRef.current || 
        content !== lastSavedContentRef.current;
      
      if (hasUnsavedChanges) {
        const changes: { title?: string; content?: string } = {};
        
        if (title !== lastSavedTitleRef.current) {
          changes.title = title;
        }
        
        if (content !== lastSavedContentRef.current) {
          changes.content = content;
        }
        
        if (Object.keys(changes).length > 0) {
          saveReport(changes);
        }
      }
    };
  }, [title, content, saveReport, report]);
  
  return (
    <div className="flex flex-col h-full">
      {/* Sticky header section */}
      <div className="sticky top-0 z-10 bg-background px-6 py-4 border-b border-border">
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
        <div className="text-sm text-gray-500 flex items-center gap-2 justify-between">
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
            
            <div className="flex items-center gap-1 ml-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1.5 h-8 text-xs"
                onClick={handlePublish}
                disabled={isPublishing || isSaving}
              >
                {isPublishing ? (
                  <>
                    <Share className="h-3.5 w-3.5 animate-pulse" />
                    <span>Publishing...</span>
                  </>
                ) : (
                  <>
                    <Share className="h-3.5 w-3.5" />
                    <span>Publish</span>
                  </>
                )}
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    <span>View public link</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    <span>Delete report</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scrollable content area with the "page" editor */}
      <div className="flex-1 overflow-y-auto px-3 py-3 bg-gray-50 dark:bg-gray-900/20">
        <div className="max-w-3xl mx-auto bg-white dark:bg-background rounded-md shadow-sm border-0">
          <TiptapEditor 
            content={content} 
            onChange={handleContentChange}
            onFocus={handleContentFocus}
            onBlur={handleContentBlur}
            className="prose dark:prose-invert max-w-none editor-subtle-focus border-0"
            placeholder="Start typing your report..."
          />
        </div>
      </div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Report
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{title}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Report'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EditableReport;