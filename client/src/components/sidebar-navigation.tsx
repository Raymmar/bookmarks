import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Bookmark, 
  Waypoints, 
  Activity, 
  Bot, 
  Circle, 
  Settings, 
  User, 
  LogOut,
  Plus,
  FolderOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { CreateCollectionDialog } from "@/components/ui/create-collection-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCollections } from "@/hooks/use-collection-queries";
import { queryClient } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";

interface SidebarNavigationProps {
  className?: string;
}

export function SidebarNavigation({ className }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  
  // Fetch collections
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  
  // Listen for collection filter events from other components
  useEffect(() => {
    const handleFilterByCollection = (event: any) => {
      console.log('SIDEBAR: filterByCollection event received:', event.detail);
      
      if (event.detail && 'collectionId' in event.detail) {
        const newCollectionId = event.detail.collectionId;
        console.log('SIDEBAR: Setting selectedCollectionId to:', newCollectionId);
        setSelectedCollectionId(newCollectionId);
      }
    };
    
    window.addEventListener('filterByCollection', handleFilterByCollection);
    return () => {
      window.removeEventListener('filterByCollection', handleFilterByCollection);
    };
  }, []);

  // Handle collection selection
  const handleCollectionClick = (collectionId: string) => {
    console.log(`Collection clicked: ${collectionId}`);
    
    if (selectedCollectionId === collectionId) {
      // If clicking the same collection, deselect it
      console.log(`Deselecting collection: ${collectionId}`);
      setSelectedCollectionId(null);
      // Clear the collection filter by dispatching an event
      window.dispatchEvent(new CustomEvent('filterByCollection', { detail: { collectionId: null } }));
      console.log('Dispatched event with null collectionId');
    } else {
      // Select the collection
      console.log(`Selecting collection: ${collectionId}`);
      setSelectedCollectionId(collectionId);
      // Filter bookmarks by collection by dispatching an event
      window.dispatchEvent(new CustomEvent('filterByCollection', { detail: { collectionId } }));
      console.log('Dispatched event with collectionId:', collectionId);
    }
  };

  // Keep the selected collection available for new bookmarks
  useEffect(() => {
    // Set up a listener for the add bookmark dialog
    const handleAddBookmarkOpen = () => {
      // The bookmark dialog will read this from localStorage
      if (selectedCollectionId) {
        localStorage.setItem('selectedCollectionId', selectedCollectionId);
      } else {
        localStorage.removeItem('selectedCollectionId');
      }
    };
    
    window.addEventListener('openAddBookmarkDialog', handleAddBookmarkOpen);
    return () => {
      window.removeEventListener('openAddBookmarkDialog', handleAddBookmarkOpen);
    };
  }, [selectedCollectionId]);

  // Add collection event listener for when a collection is created
  useEffect(() => {
    const handleCollectionCreated = (event: any) => {
      if (event.detail && event.detail.collectionId) {
        // Refresh collections
        queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
        
        // Set the newly created collection as selected
        setSelectedCollectionId(event.detail.collectionId);
        
        // Show success toast
        toast({
          title: "Collection created",
          description: "Your new collection is now available",
          variant: "default"
        });
      }
    };
    
    window.addEventListener('collectionCreated', handleCollectionCreated);
    return () => {
      window.removeEventListener('collectionCreated', handleCollectionCreated);
    };
  }, [toast]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Get user initials for the avatar
  const getUserInitials = () => {
    if (!user) return "";
    return user.username.slice(0, 2).toUpperCase();
  };
  
  // Generate a random color for a collection
  const getCollectionColor = (id: string) => {
    const colors = ['text-blue-500 fill-blue-500', 'text-green-500 fill-green-500', 'text-yellow-500 fill-yellow-500', 
                    'text-purple-500 fill-purple-500', 'text-pink-500 fill-pink-500', 'text-indigo-500 fill-indigo-500'];
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Atmosphere</h1>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow scrollbar-thin">
        <div className="p-4">
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Dashboard</h2>
            <ul>
              <li className="mb-1">
                <Link href="/">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/" || location === "/graph"
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Waypoints className="h-5 w-5 mr-2" />
                    Explore
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/activity">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/activity" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Activity className="h-5 w-5 mr-2" />
                    Activity
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/ai-chat">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/ai-chat" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Bot className="h-5 w-5 mr-2" />
                    AI Chat
                  </div>
                </Link>
              </li>
              {user && (
                <li className="mb-1">
                  <Link href="/settings">
                    <div className={cn(
                      "flex items-center px-2 py-2 text-sm rounded-lg",
                      location === "/settings" 
                        ? "bg-primary text-white" 
                        : "text-gray-700 hover:bg-gray-100"
                    )}>
                      <Settings className="h-5 w-5 mr-2" />
                      Settings
                    </div>
                  </Link>
                </li>
              )}
            </ul>
          </div>
          
          {user && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs uppercase font-semibold text-gray-500">Collections</h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={() => setCreateCollectionOpen(true)}
                  title="Create new collection"
                >
                  <Plus className="h-4 w-4 text-gray-500" />
                </Button>
              </div>
              
              <ul className="space-y-1">
                {collections.length === 0 ? (
                  <li className="text-sm text-gray-500 py-1 px-2 italic">
                    {collectionsLoading ? 'Loading collections...' : 'No collections yet'}
                  </li>
                ) : (
                  collections.map(collection => (
                    <li key={collection.id}>
                      <div 
                        className={cn(
                          "flex items-center px-2 py-2 text-sm rounded-lg cursor-pointer",
                          selectedCollectionId === collection.id 
                            ? "bg-primary/10 text-primary font-medium" 
                            : "text-gray-700 hover:bg-gray-100"
                        )}
                        onClick={() => handleCollectionClick(collection.id)}
                      >
                        <Circle className={cn("h-4 w-4 mr-2", getCollectionColor(collection.id))} />
                        <span className="truncate">{collection.name}</span>
                        {!collection.is_public && (
                          <span className="ml-1 text-xs text-gray-500">(Private)</span>
                        )}
                      </div>
                    </li>
                  ))
                )}
                
                {/* Create collection hint if no collections */}
                {collections.length === 0 && !collectionsLoading && (
                  <li>
                    <button 
                      className="flex items-center px-2 py-2 text-sm rounded-lg text-blue-500 hover:bg-blue-50 cursor-pointer w-full text-left"
                      onClick={() => setCreateCollectionOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2 text-blue-500" />
                      Create your first collection
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200">
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-2 hover:bg-gray-100 rounded-lg flex items-center">
                    <Avatar className="h-8 w-8 mr-2">
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium truncate">
                      {user.username}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <Button 
              className="w-full flex items-center justify-center"
              onClick={() => setAddBookmarkOpen(true)}
            >
              <Plus className="h-5 w-5 mr-2" />
              Add New Bookmark
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <div>
              <Button 
                className="w-full flex items-center justify-center"
              >
                <User className="h-5 w-5 mr-2" />
                Sign In
              </Button>
            </div>
          </Link>
        )}
      </div>

      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
        selectedCollectionId={selectedCollectionId}
      />
      
      <CreateCollectionDialog
        open={createCollectionOpen}
        onOpenChange={setCreateCollectionOpen}
        onCollectionCreated={(collectionId) => {
          setSelectedCollectionId(collectionId);
          // Dispatch event to notify that a collection was created
          window.dispatchEvent(new CustomEvent('collectionCreated', { 
            detail: { collectionId } 
          }));
        }}
      />
    </nav>
  );
}
