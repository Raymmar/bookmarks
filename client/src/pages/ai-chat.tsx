import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  X, Send, User, Bot, 
  Clock, Folder, FileText, 
  Plus, MoreVertical, Trash, Edit,
  Check, LogIn
} from "lucide-react";
import { TagSelector } from "@/components/ui/tag-selector";
import { 
  chatWithBookmarks, 
  getChatSessions, 
  getChatSessionWithMessages,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  type ChatMessage as ApiChatMessage,
  type ChatSession,
  type ChatFilters
} from "@/lib/openai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import ReactMarkdown from "react-markdown";

// Client-side message format
interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
}

export default function AiChat() {
  // Auth state
  const { user, isLoading: isAuthLoading } = useAuth();
  
  // Chat UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Filter state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState("month"); // Default to 30 days for more context
  const [sources, setSources] = useState<string[]>(["extension", "web", "import", "x"]);
  
  // Session state
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [showSessions, setShowSessions] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionTitle, setEditSessionTitle] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get all bookmarks
  const { data: bookmarks = [] } = useQuery({
    queryKey: ["/api/bookmarks"],
  });
  
  // Get all chat sessions
  const { data: chatSessions = [], isLoading: isSessionsLoading, refetch: refetchSessions } = useQuery({
    queryKey: ["/api/chat/sessions"],
    queryFn: async () => {
      try {
        return await getChatSessions();
      } catch (error) {
        console.error("Failed to fetch chat sessions:", error);
        return [];
      }
    },
  });
  
  // Get all normalized tags from the database
  const { data: normalizedTags = [] } = useQuery({
    queryKey: ["/api/tags"],
  });
  
  // The TagSelector component now handles tag fetching and filtering directly
  
  // Tag selection is now handled directly by the TagSelector component
  
  const toggleSource = (source: string) => {
    if (sources.includes(source)) {
      setSources(sources.filter(s => s !== source));
    } else {
      setSources([...sources, source]);
    }
  };
  
  const sendMessage = async () => {
    if (!input.trim()) return;
    
    // Create a new chat session if none exists
    if (!activeChatId) {
      try {
        await createNewChatSession();
      } catch (error) {
        console.error("Failed to create a new chat session:", error);
        
        // If we couldn't create a session, still try to send the message,
        // but it won't be persisted
      }
    }
    
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
      
      const now = new Date();
      if (dateRange === "month") {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        startDate = monthAgo.toISOString();
      } else if (dateRange === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString();
      } else if (dateRange === "day") {
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        startDate = dayAgo.toISOString();
      }
      
      // Prepare chat filters
      const chatFilters = {
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        startDate,
        source: sources.length > 0 ? sources : undefined
      };
      
      console.log("Sending chat request with filters:", chatFilters);
      
      // Call AI with context - use the session-aware version if we have an activeChatId
      let response;
      try {
        if (activeChatId) {
          response = await chatWithBookmarks(input, chatFilters, activeChatId);
        } else {
          response = await chatWithBookmarks(input, chatFilters);
        }
      } catch (innerError) {
        console.error("Failed with chatWithBookmarks, trying direct fetch:", innerError);
        
        // Direct fetch fallback
        const endpoint = activeChatId ? "/api/chat/generate" : "/api/chat";
        const requestBody = activeChatId 
          ? { message: input, filters: chatFilters, sessionId: activeChatId }
          : { query: input, filters: chatFilters };
          
        const fetchResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
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
      
      // Refresh chat sessions list
      await refetchSessions();
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
  
  // Function to load a chat session
  const loadChatSession = async (sessionId: string) => {
    try {
      setSessionsLoading(true);
      const { session, messages: sessionMessages } = await getChatSessionWithMessages(sessionId);
      
      // Set active chat ID
      setActiveChatId(sessionId);
      
      // Convert API messages to client format
      const clientMessages: Message[] = sessionMessages.map(msg => ({
        id: msg.id,
        content: msg.content,
        sender: msg.role === "user" ? "user" : "ai",
        timestamp: new Date(msg.timestamp)
      }));
      
      // Update messages state
      setMessages(clientMessages);
      
      // Set filter states if session has filters
      if (session.filters) {
        if (session.filters.tags) {
          setSelectedTags(session.filters.tags);
        }
        
        if (session.filters.source) {
          setSources(session.filters.source);
        }
        
        // Set date range
        if (session.filters.startDate) {
          const now = new Date();
          const startDate = new Date(session.filters.startDate);
          const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysDiff <= 1) {
            setDateRange("day");
          } else if (daysDiff <= 7) {
            setDateRange("week");
          } else if (daysDiff <= 30) {
            setDateRange("month");
          } else {
            // Default to month if it's an older filter setting
            setDateRange("month");
          }
        }
      }
    } catch (error) {
      console.error("Failed to load chat session:", error);
    } finally {
      setSessionsLoading(false);
    }
  };
  
  // Function to create a new chat session
  const createNewChatSession = async () => {
    try {
      setSessionsLoading(true);
      
      // Reset the UI first
      setMessages([]);
      setSelectedTags([]);
      setDateRange("month"); // Default to 30 days for more comprehensive context
      setSources(["extension", "web", "import", "x"]);
      
      // Create chat filters
      const chatFilters = {
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        source: sources.length > 0 ? sources : undefined
      };
      
      // Create a new session (default title will be "New Chat")
      const newSession = await createChatSession(undefined, chatFilters);
      
      // Set the active chat ID to the new session
      setActiveChatId(newSession.id);
      
      // Refetch sessions to update the list
      await refetchSessions();
    } catch (error) {
      console.error("Failed to create new chat session:", error);
    } finally {
      setSessionsLoading(false);
    }
  };
  
  // Function to rename a chat session
  const renameSession = async (sessionId: string, newTitle: string) => {
    try {
      setSessionsLoading(true);
      
      // Update the session with the new title
      await updateChatSession(sessionId, { title: newTitle.trim() || "New Chat" });
      
      // Reset editing state
      setEditingSessionId(null);
      setEditSessionTitle("");
      
      // Refetch the sessions to update the list
      await refetchSessions();
    } catch (error) {
      console.error("Failed to rename chat session:", error);
    } finally {
      setSessionsLoading(false);
    }
  };
  
  // Function to delete a chat session
  const deleteSession = async (sessionId: string) => {
    try {
      setSessionsLoading(true);
      
      // Delete the session
      await deleteChatSession(sessionId);
      
      // If the deleted session was active, load another one or clear the UI
      if (activeChatId === sessionId) {
        // Refresh sessions first
        await refetchSessions();
        const remainingSessions = await getChatSessions();
        
        if (remainingSessions.length > 0) {
          // Load the most recent session
          const sortedSessions = [...remainingSessions].sort((a, b) => 
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          
          await loadChatSession(sortedSessions[0].id);
        } else {
          // No sessions left, clear the UI
          setActiveChatId(null);
          setMessages([]);
          setSelectedTags([]);
          setDateRange("month"); // Default to 30 days for more context
          setSources(["extension", "web", "import", "x"]);
        }
      } else {
        // Just refresh the sessions list
        await refetchSessions();
      }
    } catch (error) {
      console.error("Failed to delete chat session:", error);
    } finally {
      setSessionsLoading(false);
    }
  };
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Load the most recent chat session on initial load
  useEffect(() => {
    if (chatSessions.length > 0 && !activeChatId) {
      // Sort sessions by updated_at and take the most recent one
      const sortedSessions = [...chatSessions].sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      
      loadChatSession(sortedSessions[0].id);
    }
  }, [chatSessions, activeChatId]);
  
  // If auth is loading, show a loading spinner
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 border-2 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-1 h-full">
      {user ? (
        // Authenticated user view - full chat interface
        <>
          {/* Chat Sessions Sidebar */}
          <div className="hidden lg:block w-64 border-r border-gray-200 bg-white overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Chat History</h3>
              <div className="flex mt-3">
                <Button 
                  onClick={createNewChatSession} 
                  disabled={sessionsLoading}
                  className="flex items-center space-x-1 w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Chat</span>
                </Button>
              </div>
            </div>
            
            <div className="divide-y divide-gray-100">
              {isSessionsLoading ? (
                <div className="flex justify-center p-4">
                  <div className="h-5 w-5 border-2 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : chatSessions.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">
                  No chat sessions yet.
                </div>
              ) : (
                chatSessions
                  .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                  .map(session => (
                    <div 
                      key={session.id}
                      className={`p-3 cursor-pointer transition-colors ${
                        activeChatId === session.id 
                          ? 'bg-gray-100' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => loadChatSession(session.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-gray-500" />
                          {editingSessionId === session.id ? (
                            <div 
                              className="flex items-center space-x-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editSessionTitle}
                                onChange={(e) => setEditSessionTitle(e.target.value)}
                                className="text-sm p-1 border rounded w-28 focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    renameSession(session.id, editSessionTitle);
                                  } else if (e.key === "Escape") {
                                    setEditingSessionId(null);
                                    setEditSessionTitle("");
                                  }
                                }}
                              />
                              <div className="flex">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0"
                                  onClick={() => renameSession(session.id, editSessionTitle)}
                                >
                                  <Check className="h-3 w-3 text-green-500" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    setEditingSessionId(null);
                                    setEditSessionTitle("");
                                  }}
                                >
                                  <X className="h-3 w-3 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm font-medium truncate max-w-36">
                              {session.title || "New Chat"}
                            </span>
                          )}
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSessionId(session.id);
                                setEditSessionTitle(session.title || "New Chat");
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-500"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                            >
                              <Trash className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div className="flex items-center text-xs text-gray-500 mt-1">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(session.updated_at).toLocaleDateString()}
                      </div>
                      
                      {/* Show filters if they exist */}
                      {session.filters && (session.filters.tags?.length || session.filters.source?.length) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {session.filters.tags?.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {session.filters.tags && session.filters.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{session.filters.tags.length - 2} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
          
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
                        {message.sender === "ai" ? (
                          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown
                              components={{
                                a: ({ node, ...props }) => (
                                  <a 
                                    {...props} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                  />
                                ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
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
              <TagSelector 
                selectedTags={selectedTags}
                onTagsChange={setSelectedTags}
              />
            </div>
            
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Time Range</h4>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Past 24 Hours</SelectItem>
                  <SelectItem value="week">Past 7 Days</SelectItem>
                  <SelectItem value="month">Past 30 Days</SelectItem>
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
                <div className="flex items-center">
                  <input 
                    type="checkbox" 
                    id="source-x"
                    className="rounded text-primary mr-2"
                    checked={sources.includes("x")}
                    onChange={() => toggleSource("x")}
                  />
                  <label htmlFor="source-x" className="text-sm">X.com</label>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <p className="text-xs text-gray-500">
                The AI will search through your bookmarks based on these context filters. Adjust them to narrow or broaden the scope of information used to answer your questions.
              </p>
            </div>
          </div>
        </>
      ) : (
        // Unauthenticated user view - prompt to log in
        <div className="flex-1 flex flex-col h-full">
          <div className="flex-1 bg-gray-50 overflow-y-auto p-4">
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-sm">
                <Bot className="h-12 w-12 text-primary mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-2">AI-powered insights + live chat.</h2>
                <p className="text-gray-500 mb-4">
                  Log in to start chatting with your bookmarks and exploring connections between topics.
                </p>
                <Button asChild className="mt-2">
                  <Link href="/auth">
                    <LogIn className="h-4 w-4 mr-2" />
                    Log in to Chat
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
