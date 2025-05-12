import { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
import { Calendar } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { debounce } from '@/lib/utils';

interface EditableReportProps {
  report: {
    id: string;
    title: string;
    content: string;
    time_period_start: string | Date;
    time_period_end: string | Date;
  };
  dateRange: string;
}

const EditableReport = ({ report, dateRange }: EditableReportProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState(report.title);
  const [content, setContent] = useState(report.content);
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(report.title);
    setContent(report.content);
  }, [report.id, report.title, report.content]);

  const saveReport = async (updates: { title?: string; content?: string }) => {
    if (!updates.title && !updates.content) return;

    setIsSaving(true);
    try {
      await apiRequest(`/api/reports/${report.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      toast({
        title: 'Report saved',
        description: 'Your changes have been saved successfully.',
        variant: 'default',
      });
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

  // Debounced save functions to avoid too many API calls
  const debouncedSaveContent = debounce((newContent: string) => {
    saveReport({ content: newContent });
  }, 1500);

  const debouncedSaveTitle = debounce((newTitle: string) => {
    saveReport({ title: newTitle });
  }, 1000);

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
      />
      <div className="text-sm text-gray-500 mb-6 flex items-center gap-2">
        <Calendar className="w-4 h-4" /> 
        {dateRange}
        {isSaving && <span className="text-xs ml-2">(Saving...)</span>}
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