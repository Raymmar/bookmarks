import { useState, useEffect, useRef } from 'react';
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
  dateRange: string;
}

const EditableReport = ({ report, dateRange }: EditableReportProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(report.title);
  const [content, setContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Update local state when report changes from props
  useEffect(() => {
    setTitle(report.title);
    setContent(report.content);
  }, [report.id, report.title, report.content]);

  const saveReport = async (updates: { title?: string; content?: string }) => {
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
  };

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

  // Debounced save functions with 2-second timeout
  const debouncedSaveContent = debounce((newContent: string) => {
    saveReport({ content: newContent });
  }, 2000); // 2 seconds

  const debouncedSaveTitle = debounce((newTitle: string) => {
    saveReport({ title: newTitle });
  }, 2000); // 2 seconds

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    debouncedSaveContent(newContent);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    debouncedSaveTitle(newTitle);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleInputRef.current?.blur();
    }
  };

  return (
    <div className="p-6">
      <input
        ref={titleInputRef}
        className="text-2xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 -ml-2"
        value={title}
        onChange={handleTitleChange}
        onKeyDown={handleTitleKeyDown}
        placeholder="Enter report title..."
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