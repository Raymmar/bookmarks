import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Bookmark, FileText, Layers, HelpCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";

interface SidebarNavigationProps {
  className?: string;
}

export function SidebarNavigation({ className }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">ATMOS</h1>
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
        onBookmarkAdded={() => {
          // Dispatch a custom event to notify graph components to refresh
          document.dispatchEvent(new CustomEvent('bookmarkAdded', { 
            detail: { source: 'navigation' } 
          }));
        }}
      />
    </nav>
  );
}
