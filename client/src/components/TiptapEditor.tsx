import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import { cn } from '@/lib/utils';

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
      if (isInitialized) {
        // Get content as markdown
        const markdown = editor.storage.markdown.getMarkdown();
        onChange(markdown);
      }
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update editor content when the content prop changes
  useEffect(() => {
    if (editor && isMounted) {
      if (!isInitialized) {
        setIsInitialized(true);
      } else {
        // Only update if the content has changed and it's not from our own onChange
        const currentMarkdown = editor.storage.markdown.getMarkdown();
        if (content !== currentMarkdown) {
          // Set content as HTML converted from markdown
          editor.commands.setContent(markdownToHtml(content));
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
    <div className={cn('prose prose-slate dark:prose-invert max-w-none', className)}>
      <EditorContent 
        editor={editor} 
        className="min-h-[300px] focus-within:outline-none border-0"
      />
    </div>
  );
};

export default TiptapEditor;