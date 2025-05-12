import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  List, 
  Link as LinkIcon,
  ListOrdered,
  Heading1,
  Heading2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TiptapMenuBarProps {
  editor: Editor | null;
}

const TiptapMenuBar = ({ editor }: TiptapMenuBarProps) => {
  if (!editor) {
    return null;
  }

  const addLink = () => {
    // Get the current selection
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    // If canceled or empty, remove the link
    if (url === null) {
      return;
    }

    // If empty, remove the link
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // Update the link
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap gap-2 py-2 border-b mb-4">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('bold')
        })}
        title="Bold"
      >
        <Bold className="w-5 h-5" />
      </button>
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('italic')
        })}
        title="Italic"
      >
        <Italic className="w-5 h-5" />
      </button>
      
      <span className="border-r mx-2"></span>
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('heading', { level: 1 })
        })}
        title="Heading 1"
      >
        <Heading1 className="w-5 h-5" />
      </button>
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('heading', { level: 2 })
        })}
        title="Heading 2"
      >
        <Heading2 className="w-5 h-5" />
      </button>
      
      <span className="border-r mx-2"></span>
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('bulletList')
        })}
        title="Bullet List"
      >
        <List className="w-5 h-5" />
      </button>
      
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('orderedList')
        })}
        title="Ordered List"
      >
        <ListOrdered className="w-5 h-5" />
      </button>
      
      <span className="border-r mx-2"></span>
      
      <button
        type="button"
        onClick={addLink}
        className={cn('p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800', {
          'bg-gray-200 dark:bg-gray-700': editor.isActive('link')
        })}
        title="Add Link"
      >
        <LinkIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default TiptapMenuBar;