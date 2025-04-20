export interface Note {
  id: string;
  bookmark_id: string;
  text: string;
  timestamp: string;
}

export interface Screenshot {
  id: string;
  bookmark_id: string;
  image_url: string;
  uploaded_at: string;
}

export interface Highlight {
  id: string;
  bookmark_id: string;
  quote: string;
  position_selector?: any;
}

export interface Insight {
  id: string;
  bookmark_id: string;
  summary?: string;
  sentiment?: number;
  depth_level: number;
  related_links: string[];
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  content_html?: string;
  vector_embedding?: number[];
  date_saved: string;
  user_tags: string[];
  system_tags: string[];
  source: string;
  notes?: Note[];
  highlights?: Highlight[];
  screenshots?: Screenshot[];
  insights?: Insight;
}

export interface Activity {
  id: string;
  bookmark_id: string;
  bookmark_title: string;
  type: "bookmark_added" | "note_added" | "highlight_added" | "insight_generated";
  content?: string;
  tags?: string[];
  timestamp: string;
}
