import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Send, User, Bot } from "lucide-react";
import { chatWithBookmarks } from "@/lib/openai";

interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
}

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState("all");
  const [sources, setSources] = useState<string[]>(["extension", "web", "import"]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get all bookmarks
  const { data: bookmarks = [] } = useQuery({
    queryKey: ["/api/bookmarks"],
  });
  
  // Get all normalized tags from the database
  const { data: normalizedTags = [] } = useQuery({
    queryKey: ["/api/tags"],
  });
  
  // Extract all unique tags from system_tags and normalized tags table
  const allTags = useMemo(() => {
    // Get system tags from bookmarks if they exist
    const systemTags = new Set(
      bookmarks.flatMap((bookmark: any) => bookmark.system_tags || [])
    );
    
    // Get normalized tags from the tags table
    const normalizedTagNames = new Set(
      normalizedTags.map((tag: any) => tag.name)
    );
    
    // Combine both sets and convert to sorted array
    return Array.from(new Set([...systemTags, ...normalizedTagNames])).sort();
  }, [bookmarks, normalizedTags]);
  
  const toggleTagSelection = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };
  
  const toggleSource = (source: string) => {
    if (sources.includes(source)) {
      setSources(sources.filter(s => s !== source));
    } else {
      setSources([...sources, source]);
    }
  };
  
  const sendMessage = async () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages([...messages, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      // Prepare date filters
      let startDate: string | undefined;
      
      if (dateRange !== "all") {
        const now = new Date();
        if (dateRange === "week") {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          startDate = weekAgo.toISOString();
        } else if (dateRange === "month") {
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          startDate = monthAgo.toISOString();
        } else if (dateRange === "year") {
          const yearAgo = new Date();
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          startDate = yearAgo.toISOString();
        }
      }
      
      // Prepare chat filters
      const chatFilters = {
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        startDate,
        source: sources.length > 0 ? sources : undefined
      };
      
      console.log("Sending chat request with filters:", chatFilters);
      
      // Call AI with context (with direct fetch as a fallback if the chatWithBookmarks fails)
      let response;
      try {
        response = await chatWithBookmarks(input, chatFilters);
      } catch (innerError) {
        console.error("Failed with chatWithBookmarks, trying direct fetch:", innerError);
        
        // Direct fetch fallback
        const fetchResponse = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: input,
            filters: chatFilters
          })
        });
        
        if (!fetchResponse.ok) {
          throw new Error(`Fetch error: ${fetchResponse.status} ${fetchResponse.statusText}`);
        }
        
        const data = await fetchResponse.json();
        if (!data || !data.response) {
          throw new Error("No response in data");
        }
        
        response = data.response;
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response,
        sender: "ai",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to get AI response:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Sorry, I encountered an error while processing your request: ${error.message || "Unknown error"}. Please try again later.`,
        sender: "ai",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  return (
    <div className="flex flex-1 h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat Messages */}
        <div className="flex-1 bg-gray-50 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-sm">
                <Bot className="h-12 w-12 text-primary mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-2">Chat with Your Bookmarks</h2>
                <p className="text-gray-600 mb-4">
                  Ask questions about your saved content, request summaries, or explore connections between topics.
                </p>
                <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
                  <p className="font-medium mb-1">Try asking:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>"Summarize my bookmarks about machine learning"</li>
                    <li>"What are the key points from my articles about API design?"</li>
                    <li>"Find connections between JavaScript and data visualization"</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map(message => (
                <div 
                  key={message.id} 
                  className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`
                    max-w-3xl rounded-lg p-3
                    ${message.sender === "user" 
                      ? "bg-primary text-white rounded-tr-none" 
                      : "bg-white border border-gray-200 rounded-tl-none"
                    }
                  `}>
                    <div className="flex items-center mb-1">
                      {message.sender === "ai" ? (
                        <Bot className="h-4 w-4 mr-1" />
                      ) : (
                        <User className="h-4 w-4 mr-1" />
                      )}
                      <span className="text-xs">
                        {message.sender === "ai" ? "AI Assistant" : "You"}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* Input Area */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex space-x-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your bookmarks..."
              className="resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button 
              onClick={sendMessage} 
              disabled={isLoading || !input.trim()}
              className="self-end"
            >
              {isLoading ? (
                <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Context Panel */}
      <div className="hidden md:block w-72 border-l border-gray-200 bg-white overflow-y-auto p-4">
        <h3 className="font-semibold text-gray-800 mb-3">Search Context</h3>
        
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {allTags.map(tag => (
              <Badge 
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleTagSelection(tag)}
              >
                {tag}
                {selectedTags.includes(tag) && (
                  <X 
                    className="h-3 w-3 ml-1" 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTagSelection(tag);
                    }}
                  />
                )}
              </Badge>
            ))}
          </div>
        </div>
        
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Time Range</h4>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger>
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="week">Past Week</SelectItem>
              <SelectItem value="month">Past Month</SelectItem>
              <SelectItem value="year">Past Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Sources</h4>
          <div className="space-y-2">
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="source-extension"
                className="rounded text-primary mr-2"
                checked={sources.includes("extension")}
                onChange={() => toggleSource("extension")}
              />
              <label htmlFor="source-extension" className="text-sm">Extension</label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="source-web"
                className="rounded text-primary mr-2"
                checked={sources.includes("web")}
                onChange={() => toggleSource("web")}
              />
              <label htmlFor="source-web" className="text-sm">Web App</label>
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="source-import"
                className="rounded text-primary mr-2"
                checked={sources.includes("import")}
                onChange={() => toggleSource("import")}
              />
              <label htmlFor="source-import" className="text-sm">Import</label>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <p className="text-xs text-gray-500">
            The AI will search through your bookmarks based on these context filters. Adjust them to narrow or broaden the scope of information used to answer your questions.
          </p>
        </div>
      </div>
    </div>
  );
}
