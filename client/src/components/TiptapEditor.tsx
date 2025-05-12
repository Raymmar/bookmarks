import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import { cn } from '@/lib/utils';
import TiptapMenuBar from './TiptapMenuBar';
import { debounce } from '@/lib/utils';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  editable?: boolean;
}

const TiptapEditor = ({
  content,
  onChange,
  className,
  placeholder = 'Start typing...',
  editable = true,
}: TiptapEditorProps) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Reference to store the debounced onChange function
  const debouncedOnChangeRef = useRef<any>(null);
  
  // Create the debounced function once and store it in the ref
  useEffect(() => {
    debouncedOnChangeRef.current = debounce((markdown: string) => {
      onChange(markdown);
    }, 3000); // Increased to 3 seconds to reduce API calls
  }, [onChange]);
  
  // Convert markdown to HTML for initial content
  const markdownToHtml = useCallback((markdown: string) => {
    const md = new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true,
    });
    return md.render(markdown);
  }, []);

  // Initialize the editor with the given content
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Disable built-in heading to avoid duplication
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: true,
        breaks: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
    ],
    content: markdownToHtml(content),
    editable,
    onUpdate: ({ editor }) => {
      if (isInitialized && debouncedOnChangeRef.current) {
        // Get content as markdown
        const markdown = editor.storage.markdown.getMarkdown();
        // Use the debounced function
        debouncedOnChangeRef.current(markdown);
      }
    },
  });

  useEffect(() => {
    setIsMounted(true);
    
    // Cleanup on unmount
    return () => {
      if (debouncedOnChangeRef.current) {
        debouncedOnChangeRef.current.cancel();
      }
    };
  }, []);

  // Update editor content when the content prop changes
  useEffect(() => {
    if (editor && isMounted) {
      if (!isInitialized) {
        setIsInitialized(true);
      } else {
        try {
          // Only update if the content has changed and it's not from our own onChange
          const currentMarkdown = editor.storage.markdown.getMarkdown();
          if (content !== currentMarkdown) {
            // Set content as HTML converted from markdown
            editor.commands.setContent(markdownToHtml(content));
          }
        } catch (error) {
          console.error('Error updating editor content:', error);
        }
      }
    }
  }, [editor, content, isMounted, isInitialized, markdownToHtml]);

  // Update editor editable state when the editable prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Add custom styles for the editor
  return (
    <div className={cn('prose prose-slate dark:prose-invert max-w-none border rounded-md p-4', className)}>
      {editor && <TiptapMenuBar editor={editor} />}
      <EditorContent 
        editor={editor} 
        className="min-h-[300px] focus-within:outline-none"
      />
    </div>
  );
};

export default TiptapEditor;