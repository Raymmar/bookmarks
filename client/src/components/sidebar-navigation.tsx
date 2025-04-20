import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Bookmark, FileText, Layers, HelpCircle, Home, X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";

interface SidebarNavigationProps {
  className?: string;
  onFiltersChange?: (filters: {
    tags: string[];
    dateRange: string;
    sources: string[];
  }) => void;
}

export function SidebarNavigation({ className, onFiltersChange }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState("week");
  const [sources, setSources] = useState<string[]>(["extension", "web", "import"]);
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);

  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSourceToggle = (source: string, checked: boolean) => {
    if (checked) {
      setSources([...sources, source]);
    } else {
      setSources(sources.filter(s => s !== source));
    }
  };

  // Update parent component with filter changes
  const updateFilters = () => {
    if (onFiltersChange) {
      onFiltersChange({
        tags: selectedTags,
        dateRange,
        sources,
      });
    }
  };

  // Dummy tag data - in a real app, these would come from the API
  const availableTags = ["Technology", "Research", "Tutorial", "JavaScript", "Machine Learning", "API"];

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Universal Bookmarks</h1>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow scrollbar-thin">
        <div className="p-4">
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Dashboard</h2>
            <ul>
              <li className="mb-1">
                <Link href="/">
                  <a className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/" || location === "/graph"
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Layers className="h-5 w-5 mr-2" />
                    Explore
                  </a>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/activity">
                  <a className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/activity" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <FileText className="h-5 w-5 mr-2" />
                    Activity Feed
                  </a>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/ai-chat">
                  <a className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/ai-chat" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <HelpCircle className="h-5 w-5 mr-2" />
                    AI Chat
                  </a>
                </Link>
              </li>
            </ul>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Filters</h2>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <Badge 
                      key={tag}
                      variant="outline" 
                      className={cn(
                        "px-2 py-1 text-xs rounded-full flex items-center cursor-pointer",
                        isSelected 
                          ? "bg-indigo-100 text-indigo-800" 
                          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                      )}
                      onClick={() => {
                        handleTagToggle(tag);
                        updateFilters();
                      }}
                    >
                      {tag}
                      {isSelected && (
                        <X 
                          className="h-3 w-3 ml-1 cursor-pointer" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTagToggle(tag);
                            updateFilters();
                          }}
                        />
                      )}
                    </Badge>
                  );
                })}
              </div>
              
              <div className="mt-3">
                <h3 className="text-xs font-medium text-gray-700 mb-1">Date Range</h3>
                <div className="flex items-center space-x-2">
                  <Select 
                    value={dateRange} 
                    onValueChange={(value) => {
                      setDateRange(value);
                      updateFilters();
                    }}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue placeholder="Select date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">Past Week</SelectItem>
                      <SelectItem value="month">Past Month</SelectItem>
                      <SelectItem value="quarter">Past 3 Months</SelectItem>
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="mt-3">
                <h3 className="text-xs font-medium text-gray-700 mb-1">Source</h3>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="source-extension" 
                      checked={sources.includes("extension")}
                      onCheckedChange={(checked) => {
                        handleSourceToggle("extension", checked as boolean);
                        updateFilters();
                      }}
                    />
                    <label htmlFor="source-extension" className="text-xs">Extension</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="source-web" 
                      checked={sources.includes("web")}
                      onCheckedChange={(checked) => {
                        handleSourceToggle("web", checked as boolean);
                        updateFilters();
                      }}
                    />
                    <label htmlFor="source-web" className="text-xs">Web App</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="source-import" 
                      checked={sources.includes("import")}
                      onCheckedChange={(checked) => {
                        handleSourceToggle("import", checked as boolean);
                        updateFilters();
                      }}
                    />
                    <label htmlFor="source-import" className="text-xs">Import</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Collections</h2>
            <ul className="space-y-1">
              <li>
                <a href="#" className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100">
                  <Circle className="h-4 w-4 mr-2 text-yellow-500 fill-yellow-500" />
                  Research Project
                </a>
              </li>
              <li>
                <a href="#" className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100">
                  <Circle className="h-4 w-4 mr-2 text-green-500 fill-green-500" />
                  Web Development
                </a>
              </li>
              <li>
                <a href="#" className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100">
                  <Circle className="h-4 w-4 mr-2 text-blue-500 fill-blue-500" />
                  Machine Learning
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <Button 
          className="w-full flex items-center justify-center"
          onClick={() => setAddBookmarkOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add New Bookmark
        </Button>
      </div>

      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
      />
    </nav>
  );
}
