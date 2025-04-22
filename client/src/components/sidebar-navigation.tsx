import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Bookmark,
  FileText,
  Layers,
  HelpCircle,
  CircleIcon,
  Settings,
  FolderPlus,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { UserProfile } from "@/components/ui/user-profile";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Collection } from "@shared/schema";

interface SidebarNavigationProps {
  className?: string;
}

export function SidebarNavigation({ className }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const { user } = useAuth();
  
  // Fetch collections
  const { data: collections = [] } = useQuery<Collection[]>({
    queryKey: ["/api/collections"],
    enabled: true,
  });

  // Filter collections by ownership
  const userCollections = collections.filter(collection => 
    user && collection.owner_id === user.id
  );
  
  const publicCollections = collections.filter(collection => 
    collection.is_public && (!user || collection.owner_id !== user.id)
  );

  const collectionColors = [
    "text-yellow-500 fill-yellow-500",
    "text-green-500 fill-green-500",
    "text-blue-500 fill-blue-500",
    "text-indigo-500 fill-indigo-500",
    "text-purple-500 fill-purple-500",
    "text-pink-500 fill-pink-500",
    "text-red-500 fill-red-500",
    "text-orange-500 fill-orange-500",
  ];

  // Function to get a deterministic color based on collection id
  const getCollectionColor = (id: string) => {
    const sum = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return collectionColors[sum % collectionColors.length];
  };

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Atmosphere</h1>
        </div>
      </div>
      
      {/* User profile section */}
      <div className="border-b border-gray-200">
        <UserProfile />
      </div>
      
      <div className="overflow-y-auto flex-grow scrollbar-thin">
        <div className="p-4">
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Dashboard</h2>
            <ul>
              <li className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg",
                    location === "/" || location === "/graph"
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  asChild
                >
                  <Link href="/">
                    <Layers className="h-5 w-5 mr-2" />
                    Explore
                  </Link>
                </Button>
              </li>
              <li className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg",
                    location === "/activity"
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  asChild
                >
                  <Link href="/activity">
                    <FileText className="h-5 w-5 mr-2" />
                    Activity Feed
                  </Link>
                </Button>
              </li>
              <li className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg",
                    location === "/ai-chat"
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  asChild
                >
                  <Link href="/ai-chat">
                    <HelpCircle className="h-5 w-5 mr-2" />
                    AI Chat
                  </Link>
                </Button>
              </li>
              <li className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    "flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg",
                    location === "/settings"
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  asChild
                >
                  <Link href="/settings">
                    <Settings className="h-5 w-5 mr-2" />
                    Settings
                  </Link>
                </Button>
              </li>
            </ul>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs uppercase font-semibold text-gray-500">My Collections</h2>
              {user && (
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <FolderPlus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {user ? (
              <ul className="space-y-1">
                {userCollections.length > 0 ? (
                  userCollections.map((collection) => (
                    <li key={collection.id}>
                      <Button
                        variant="ghost"
                        className="flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100"
                        asChild
                      >
                        <Link href={`/collections/${collection.id}`}>
                          <CircleIcon className={cn("h-4 w-4 mr-2", getCollectionColor(collection.id))} />
                          <span className="truncate">{collection.name}</span>
                          {collection.is_default && (
                            <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">Default</span>
                          )}
                        </Link>
                      </Button>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-gray-500 py-2">
                    No collections yet
                  </li>
                )}
              </ul>
            ) : (
              <div className="text-sm text-gray-500 py-2">
                <Link href="/auth">
                  <Button variant="link" className="p-0 h-auto">Sign in</Button>
                </Link>
                {" "}to manage collections
              </div>
            )}
          </div>
          
          {publicCollections.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Public Collections</h2>
              <ul className="space-y-1">
                {publicCollections.map((collection) => (
                  <li key={collection.id}>
                    <Button
                      variant="ghost"
                      className="flex w-full justify-start items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100"
                      asChild
                    >
                      <Link href={`/collections/${collection.id}`}>
                        <CircleIcon className={cn("h-4 w-4 mr-2", getCollectionColor(collection.id))} />
                        <span className="truncate">{collection.name}</span>
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200">
        <Button 
          className="w-full flex items-center justify-center"
          onClick={() => setAddBookmarkOpen(true)}
        >
          <Plus className="h-5 w-5 mr-2" />
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
