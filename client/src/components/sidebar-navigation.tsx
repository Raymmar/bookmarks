import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Bookmark, 
  Waypoints, 
  Activity, 
  Bot,  
  Settings, 
  User, 
  LogOut,
  Plus,
  Folder,
  MoreHorizontal,
  Edit,
  Trash2,
  Cable,
  FileText,
  ListFilter
} from "lucide-react";
import { cn, createUrlSlug } from "@/lib/utils";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { CreateCollectionDialog } from "@/components/ui/create-collection-dialog";
import { EditCollectionDialog } from "@/components/ui/edit-collection-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCollections, useCollectionMutations } from "@/hooks/use-collection-queries";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SidebarNavigationProps {
  className?: string;
}

export function SidebarNavigation({ className }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [selectedCollectionToEdit, setSelectedCollectionToEdit] = useState<{
    id: string;
    name: string;
    description: string | null;
    is_public: boolean;
  } | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  
  // Fetch collections
  const { data: collections = [], isLoading: collectionsLoading } = useCollections();
  
  // Separate collections into public and private
  const publicCollections = collections.filter(collection => collection.is_public);
  const privateCollections = collections.filter(collection => !collection.is_public);
  
  // Get mutations for collections (create, update, delete)
  const { updateCollection, deleteCollection } = useCollectionMutations();

  // Track selected collections for multi-selection with localStorage persistence
  const [selectedCollections, setSelectedCollections] = useState<string[]>(() => {
    // Initialize from localStorage if available
    const savedCollections = localStorage.getItem('selectedCollections');
    return savedCollections ? JSON.parse(savedCollections) : [];
  });
  
  // Save selected collections to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedCollections', JSON.stringify(selectedCollections));
    
    // If we have selectedCollections, dispatch the filter event on page load
    if (selectedCollections.length > 0) {
      if (selectedCollections.length === 1) {
        // Single collection
        const singleId = selectedCollections[0];
        setSelectedCollectionId(singleId);
        window.dispatchEvent(new CustomEvent('filterByCollection', { 
          detail: { collectionId: singleId, collectionIds: selectedCollections } 
        }));
      } else {
        // Multiple collections
        setSelectedCollectionId(null); // Clear single selection
        window.dispatchEvent(new CustomEvent('filterByCollection', { 
          detail: { collectionId: null, collectionIds: selectedCollections } 
        }));
      }
    }
  }, [selectedCollections]);
  
  // Handle collection selection with improved multi-select
  const handleCollectionClick = (collectionId: string) => {
    // Check if collection is already selected
    const isSelected = selectedCollections.includes(collectionId);
    let newSelection: string[];
    
    if (isSelected) {
      // Remove from selection if already selected
      newSelection = selectedCollections.filter(id => id !== collectionId);
    } else {
      // Add to selection
      newSelection = [...selectedCollections, collectionId];
    }
    
    // Save to localStorage immediately to ensure persistence
    localStorage.setItem('selectedCollections', JSON.stringify(newSelection));
    
    setSelectedCollections(newSelection);
    
    if (newSelection.length === 0) {
      // Clear all filters if nothing selected
      setSelectedCollectionId(null);
      window.dispatchEvent(new CustomEvent('filterByCollection', { 
        detail: { collectionId: null, collectionIds: [] } 
      }));
    } else if (newSelection.length === 1) {
      // Single collection selected
      const singleId = newSelection[0];
      setSelectedCollectionId(singleId);
      window.dispatchEvent(new CustomEvent('filterByCollection', { 
        detail: { collectionId: singleId, collectionIds: newSelection } 
      }));
    } else {
      // Multiple collections selected
      setSelectedCollectionId(null); // Clear single selection
      window.dispatchEvent(new CustomEvent('filterByCollection', { 
        detail: { collectionId: null, collectionIds: newSelection } 
      }));
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
        
        // Add the new collection to selectedCollections
        const newCollectionId = event.detail.collectionId;
        const newSelection = [newCollectionId];
        
        // Save to localStorage immediately
        localStorage.setItem('selectedCollections', JSON.stringify(newSelection));
        
        // Update state
        setSelectedCollections(newSelection);
        setSelectedCollectionId(newCollectionId);
        
        // Trigger the filter event with the new collection
        window.dispatchEvent(new CustomEvent('filterByCollection', { 
          detail: { collectionId: newCollectionId, collectionIds: newSelection } 
        }));
        
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

  // Render collection item for both public and private collections
  const renderCollectionItem = (collection: any) => (
    <li key={collection.id}>
      <div className="relative pr-8">
        <Link 
          href={`/collection/${createUrlSlug(collection.name)}`}
          className="block w-full"
        >
          <div 
            className={cn(
              "flex items-center pr-6 px-2 py-1.5 text-sm rounded-md cursor-pointer",
              selectedCollections.includes(collection.id) && location !== `/collection/${createUrlSlug(collection.name)}`
                ? "bg-primary/10 text-primary" 
                : "text-gray-700 hover:bg-gray-100",
              location === `/collection/${createUrlSlug(collection.name)}`
                ? "bg-secondary/20 text-primary border border-primary/20"
                : ""
            )}
            title="View collection"
          >
            <Folder className={cn("h-3.5 w-3.5 mr-2 flex-shrink-0")} />
            <span className={cn("truncate", 
              (selectedCollections.includes(collection.id) || 
               location === `/collection/${createUrlSlug(collection.name)}`) && "font-medium"
            )}>
              {collection.name}
            </span>
          </div>
        </Link>
        
        {user && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3 w-3 text-gray-500" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px]">
                <DropdownMenuItem 
                  onClick={() => {
                    setSelectedCollectionToEdit({
                      id: collection.id,
                      name: collection.name,
                      description: collection.description,
                      is_public: collection.is_public
                    });
                    setEditCollectionOpen(true);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedCollectionToEdit({
                      id: collection.id,
                      name: collection.name,
                      description: collection.description,
                      is_public: collection.is_public
                    });
                    setDeleteConfirmOpen(true);
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </li>
  );

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Bookmarks</h1>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow scrollbar-thin">
        <div className="p-4">
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Menu</h2>
            <ul>
              <li className="mb-1">
                <Link href="/">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/" || location === "/feed"
                      ? "bg-secondary/20 text-primary border border-primary/20" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Bookmark className={cn("h-5 w-5 mr-2", 
                      location === "/" || location === "/feed" ? "text-primary" : ""
                    )} />
                    Bookmarks
                  </div>
                </Link>
              </li>
              {user && (
                <li className="mb-1">
                  <Link href="/reports">
                    <div className={cn(
                      "flex items-center px-2 py-2 text-sm rounded-lg",
                      location === "/reports" 
                        ? "bg-secondary/20 text-primary border border-primary/20" 
                        : "text-gray-700 hover:bg-gray-100"
                    )}>
                      <FileText className={cn("h-5 w-5 mr-2", 
                        location === "/reports" ? "text-primary" : ""
                      )} />
                      Reports
                    </div>
                  </Link>
                </li>
              )}
              <li className="mb-1">
                <Link href="/graph">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/graph"
                      ? "bg-secondary/20 text-primary border border-primary/20" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Waypoints className={cn("h-5 w-5 mr-2", 
                      location === "/graph" ? "text-primary" : ""
                    )} />
                    Graph
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/activity">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/activity" 
                      ? "bg-secondary/20 text-primary border border-primary/20" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Activity className={cn("h-5 w-5 mr-2", 
                      location === "/activity" ? "text-primary" : ""
                    )} />
                    Activity
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/ai-chat">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/ai-chat" 
                      ? "bg-secondary/20 text-primary border border-primary/20" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Bot className={cn("h-5 w-5 mr-2", 
                      location === "/ai-chat" ? "text-primary" : ""
                    )} />
                    AI Chat
                  </div>
                </Link>
              </li>
              {user && (
                <>
                  <li className="mb-1">
                    <Link href="/x-integration">
                      <div className={cn(
                        "flex items-center px-2 py-2 text-sm rounded-lg",
                        location === "/x-integration" 
                          ? "bg-secondary/20 text-primary border border-primary/20" 
                          : "text-gray-700 hover:bg-gray-100"
                      )}>
                        <Cable className={cn("h-5 w-5 mr-2", 
                          location === "/x-integration" ? "text-primary" : ""
                        )} />
                        Connect
                      </div>
                    </Link>
                  </li>
                  <li className="mb-1">
                    <Link href="/settings">
                      <div className={cn(
                        "flex items-center px-2 py-2 text-sm rounded-lg",
                        location === "/settings" 
                          ? "bg-secondary/20 text-primary border border-primary/20" 
                          : "text-gray-700 hover:bg-gray-100"
                      )}>
                        <Settings className={cn("h-5 w-5 mr-2", 
                          location === "/settings" ? "text-primary" : ""
                        )} />
                        Settings
                      </div>
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
          
          {/* Collections section - shown for both logged in and logged out users */}
          <div className="mb-6">
            <div className="flex flex-col space-y-1 mb-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs uppercase font-semibold text-gray-500">Collections</h2>
                {/* Only show Create button for logged in users */}
                {user && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => setCreateCollectionOpen(true)}
                    title="Create new collection"
                  >
                    <Plus className="h-4 w-4 text-gray-500" />
                  </Button>
                )}
              </div>
            </div>
            
            {collectionsLoading ? (
              <div className="text-sm text-gray-500 py-1 px-2 italic">
                Loading collections...
              </div>
            ) : collections.length === 0 ? (
              <div className="text-sm text-gray-500 py-1 px-2 italic">
                {user ? 'No collections yet' : 'No public collections available'}
              </div>
            ) : user ? (
              /* Logged in users see accordion with public and private collections */
              <Accordion type="multiple" defaultValue={["public", "private"]} className="space-y-2">
                {/* Public Collections */}
                <AccordionItem value="public" className="border-none">
                  <AccordionTrigger 
                    className="py-1.5 px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded bg-gray-100 mb-1"
                  >
                    Public Collections ({publicCollections.length})
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-2 px-1">
                    <ul className="space-y-1 pl-2 border-l-2 border-gray-100">
                      {publicCollections.length === 0 ? (
                        <li className="text-xs text-gray-500 pl-3 py-1 italic">
                          No public collections
                        </li>
                      ) : (
                        publicCollections.map(collection => renderCollectionItem(collection))
                      )}
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* Private Collections */}
                <AccordionItem value="private" className="border-none">
                  <AccordionTrigger 
                    className="py-1.5 px-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded bg-gray-100 mb-1"
                  >
                    Private Collections ({privateCollections.length})
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-2 px-1">
                    <ul className="space-y-1 pl-2 border-l-2 border-gray-100">
                      {privateCollections.length === 0 ? (
                        <li className="text-xs text-gray-500 pl-3 py-1 italic">
                          No private collections
                        </li>
                      ) : (
                        privateCollections.map(collection => renderCollectionItem(collection))
                      )}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              /* Logged out users only see public collections */
              <div className="space-y-2">
                <div className="py-1.5 px-2.5 text-xs font-semibold text-gray-700 bg-gray-100 rounded mb-1">
                  Public Collections ({publicCollections.length})
                </div>
                
                <ul className="space-y-1 pl-3 border-l-2 border-gray-100">
                  {publicCollections.length === 0 ? (
                    <li className="text-sm text-gray-500 py-1 px-2 italic">
                      No public collections available
                    </li>
                  ) : (
                    publicCollections.map(collection => (
                      <li key={collection.id}>
                        <div className="relative pr-8">
                          <Link 
                            href={`/collection/${createUrlSlug(collection.name)}`}
                            className="block w-full"
                          >
                            <div 
                              className={cn(
                                "flex items-center pr-6 px-2 py-1.5 text-sm rounded-md cursor-pointer",
                                selectedCollections.includes(collection.id) 
                                  ? "bg-primary/10 text-primary" 
                                  : "text-gray-700 hover:bg-gray-50",
                                location === `/collection/${createUrlSlug(collection.name)}`
                                  ? "border border-primary/20 bg-secondary/10"
                                  : ""
                              )}
                              title="View collection"
                            >
                              <Folder className="h-3.5 w-3.5 mr-2 opacity-70 flex-shrink-0" />
                              <span className={cn("truncate", 
                                (selectedCollections.includes(collection.id) || 
                                 location === `/collection/${encodeURIComponent(collection.name)}`) && "font-medium"
                              )}>
                                {collection.name}
                              </span>
                            </div>
                          </Link>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
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
                    <div className="text-sm font-medium truncate" style={{ maxWidth: "140px" }}>
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
      
      <EditCollectionDialog
        open={editCollectionOpen}
        onOpenChange={setEditCollectionOpen}
        collection={selectedCollectionToEdit}
        onCollectionUpdated={() => {
          // Refresh collections data
          queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
        }}
      />
      
      {/* Delete Collection Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this collection? This action cannot be undone.
              This will only remove the collection, not the bookmarks within it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (!selectedCollectionToEdit) return;
                
                // Close dialog immediately for optimistic UI
                setDeleteConfirmOpen(false);
                
                // Show optimistic success message
                toast({
                  title: "Collection deleted",
                  description: "Your collection has been deleted successfully",
                });
                
                try {
                  // If we're deleting the currently selected collection
                  if (selectedCollectionToEdit && selectedCollections.includes(selectedCollectionToEdit.id)) {
                    // Remove the deleted collection from selected collections
                    const newSelection = selectedCollections.filter(id => id !== selectedCollectionToEdit.id);
                    setSelectedCollections(newSelection);
                    
                    // Update localStorage
                    localStorage.setItem('selectedCollections', JSON.stringify(newSelection));
                    
                    // Update filter state
                    if (newSelection.length === 0) {
                      // Clear all filters if nothing selected
                      setSelectedCollectionId(null);
                      window.dispatchEvent(new CustomEvent('filterByCollection', { 
                        detail: { collectionId: null, collectionIds: [] } 
                      }));
                    } else if (newSelection.length === 1) {
                      // Single collection selected
                      const singleId = newSelection[0];
                      setSelectedCollectionId(singleId);
                      window.dispatchEvent(new CustomEvent('filterByCollection', { 
                        detail: { collectionId: singleId, collectionIds: newSelection } 
                      }));
                    }
                  }
                
                  // Perform the actual deletion
                  try {
                    await deleteCollection.mutateAsync(selectedCollectionToEdit.id);
                    
                    // Refresh collections data
                    queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
                    
                    // Clear any cached references to this collection 
                    // to prevent stale data issues
                    queryClient.removeQueries({ 
                      queryKey: ['/api/collections', selectedCollectionToEdit.id] 
                    });
                    queryClient.removeQueries({ 
                      queryKey: ['/api/collections', selectedCollectionToEdit.id, 'tags'] 
                    });
                    queryClient.removeQueries({ 
                      queryKey: ['/api/collections/graph', selectedCollectionToEdit.id] 
                    });
                  } catch (error) {
                    console.error('Error deleting collection:', error);
                    toast({
                      title: "Error occurred",
                      description: "There was an issue with deleting the collection. Please try again.",
                      variant: "destructive",
                    });
                  }
                } catch (error) {
                  // This is a fallback and likely won't be reached due to the onError handler above
                  console.error('Error deleting collection:', error);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}