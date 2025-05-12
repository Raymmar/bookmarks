import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
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

  // Initialize the editor with the given content
  const editor = useEditor({
    extensions: [
      StarterKit,
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
    ],
    content: content, // Initialize with markdown content
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Update editor content when the content prop changes
  useEffect(() => {
    if (editor && isMounted) {
      // Only update if the content has changed
      const currentContent = editor.getHTML();
      if (content !== currentContent) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content, isMounted]);

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