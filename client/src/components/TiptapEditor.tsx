import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Heading from '@tiptap/extension-heading';
import { Markdown } from 'tiptap-markdown';
import MarkdownIt from 'markdown-it';
import { cn } from '@/lib/utils';
import { debounce } from '@/lib/utils';
import { 
  Bold, 
  Italic, 
  ListOrdered, 
  List, 
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  className?: string;
  placeholder?: string;
  editable?: boolean;
}

// Menu button component for bubble menu
const MenuButton = ({ 
  active = false, 
  onClick, 
  children 
}: { 
  active?: boolean; 
  onClick: () => void; 
  children: React.ReactNode 
}) => {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon"
      className={cn(
        "h-8 w-8 p-0 rounded-full",
        active && "bg-primary text-primary-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
};

const TiptapEditor = ({
  content,
  onChange,
  onBlur,
  onFocus,
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

  // Create a debounced onChange handler with a more responsive delay
  const debouncedOnChange = useMemo(
    () => debounce((markdown: string) => {
      onChange(markdown);
    }, 3000), // 3 seconds delay - increased to reduce frequency of cursor position resets
    [onChange]
  );

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
        // Use debounced onChange
        debouncedOnChange(markdown);
      }
    },
    onFocus: () => {
      if (isInitialized && onFocus) {
        onFocus();
      }
    },
    onBlur: ({ editor }) => {
      if (isInitialized) {
        // Get content as markdown
        const markdown = editor.storage.markdown.getMarkdown();
        // Save immediately on blur (not debounced)
        onChange(markdown);
        // Call custom onBlur handler if provided
        if (onBlur) {
          onBlur();
        }
      }
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track when we should ignore external content updates
  const [ignoreExternalUpdates, setIgnoreExternalUpdates] = useState(false);
  
  // Update the ignoreExternalUpdates flag when focus/blur happens
  useEffect(() => {
    if (!editor) return;
    
    const handleFocus = () => {
      setIgnoreExternalUpdates(true);
    };
    
    const handleBlur = () => {
      // We'll keep ignoring external updates for a short time after blur
      // to prevent flicker when the API response comes back
      setTimeout(() => {
        setIgnoreExternalUpdates(false);
      }, 1000); // Ignore for 1 second after blur
    };
    
    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);
    
    return () => {
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor]);
  
  // Update editor content when the content prop changes
  useEffect(() => {
    if (editor && isMounted) {
      if (!isInitialized) {
        setIsInitialized(true);
      } else if (!ignoreExternalUpdates) {
        // Only update if: 
        // 1. We're not ignoring external updates
        // 2. The content has changed and it's not from our own onChange
        const currentMarkdown = editor.storage.markdown.getMarkdown();
        if (content !== currentMarkdown) {
          // Save current selection state
          const { from, to } = editor.state.selection;
          
          // Set content as HTML converted from markdown
          editor.commands.setContent(markdownToHtml(content));
          
          // After updating content, restore the selection position
          window.requestAnimationFrame(() => {
            // Make sure editor is still available
            if (editor.isDestroyed) return;
            
            // Try to restore cursor position to where it was before
            editor.commands.setTextSelection({ from, to });
          });
        }
      }
    }
  }, [editor, content, isMounted, isInitialized, markdownToHtml, ignoreExternalUpdates]);

  // Update editor editable state when the editable prop changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  if (!editor) {
    return null;
  }

  // Add custom styles for the editor
  return (
    <div className={cn('prose prose-slate dark:prose-invert max-w-none', className)}>
      {/* Bubble menu for text formatting */}
      <BubbleMenu 
        editor={editor} 
        tippyOptions={{ duration: 150 }}
        shouldShow={({ editor, from, to }) => {
          // Only show when text is selected
          return from !== to && editor.isEditable;
        }}
        className="bg-popover text-popover-foreground shadow-md rounded-md p-1.5 flex gap-1"
      >
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
        >
          <Bold className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton 
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
        >
          <Italic className="h-4 w-4" />
        </MenuButton>
        
        <div className="w-px h-6 bg-border mx-1"></div>
        
        <MenuButton 
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        >
          <List className="h-4 w-4" />
        </MenuButton>
        
        <MenuButton 
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </MenuButton>
        
        <div className="w-px h-6 bg-border mx-1"></div>
        
        <MenuButton 
          onClick={() => {
            if (editor.isActive('link')) {
              // If a link is active, unset it
              editor.chain().focus().unsetLink().run();
            } else {
              // Prompt user for URL
              const url = window.prompt('Enter link URL:');
              if (url) {
                editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              }
            }
          }}
          active={editor.isActive('link')}
        >
          <LinkIcon className="h-4 w-4" />
        </MenuButton>
      </BubbleMenu>
      
      <EditorContent 
        editor={editor} 
        className="min-h-[300px] focus-within:outline-none border-0 p-4" 
      />
    </div>
  );
};

export default TiptapEditor;