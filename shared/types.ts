import { 
  Bookmark as DrizzleBookmark, 
  Note, Screenshot, Highlight, Insight, Activity, 
  Tag, BookmarkTag, ChatSession, ChatMessage, Setting
} from "./schema";

// Extended Bookmark type to include additional runtime properties
export interface Bookmark extends Omit<DrizzleBookmark, 'ai_processing_status'> {
  ai_processing_status?: 'pending' | 'processing' | 'completed' | 'failed';
  notes?: Note[];
  highlights?: Highlight[];
  screenshots?: Screenshot[];
  insights?: Insight;
}

// Re-export other types
export { 
  Note, Screenshot, Highlight, Insight, Activity, 
  Tag, BookmarkTag, ChatSession, ChatMessage, Setting 
};