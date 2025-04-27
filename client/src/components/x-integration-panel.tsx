import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, RefreshCw, FolderPlus, Link, Cable, Twitter, Download, DownloadCloud } from "lucide-react";

// Type definitions
interface XConnectionStatus {
  connected: boolean;
  username?: string;
  lastSync?: string | null;
}

interface XFolder {
  id: string;
  name: string;
  collection_id: string | null;
  mapped: boolean;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
}

const XIntegrationPanel = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [codeVerifier, setCodeVerifier] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<XFolder | null>(null);
  const [createNewCollection, setCreateNewCollection] = useState(true);
  const [isMappingFolder, setIsMappingFolder] = useState(false);

  // Fetch X.com connection status
  const { data: connectionStatus, isLoading: isLoadingStatus } = useQuery<XConnectionStatus>({
    queryKey: ['/api/x/status'],
    refetchOnWindowFocus: false,
    retry: false
  });

  // Fetch X.com folders if connected
  const { 
    data: folders, 
    isLoading: isLoadingFolders,
    refetch: refetchFolders 
  } = useQuery<XFolder[]>({
    queryKey: ['/api/x/folders'],
    enabled: !!connectionStatus?.connected,
    retry: false,
    refetchOnWindowFocus: false
  });

  // Fetch user collections for mapping
  const { 
    data: collections 
  } = useQuery<Collection[]>({
    queryKey: ['/api/collections'],
    retry: false,
    refetchOnWindowFocus: false
  });

  // Force disconnect from X.com
  const forceDisconnect = useMutation({
    mutationFn: async () => {
      console.log("X OAuth: Force disconnecting from X.com");
      const response = await fetch('/api/x/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect from X.com');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      console.log("X OAuth: Successfully disconnected from X.com");
      // No UI feedback needed since we'll reconnect immediately
    },
    onError: (error) => {
      console.error("X OAuth: Failed to disconnect:", error);
      // Continue with auth flow anyway
    }
  });

  // Start X.com authorization flow
  const startAuth = useMutation({
    mutationFn: async () => {
      // First try to force disconnect to ensure a clean slate
      try {
        console.log("X OAuth: Attempting to clean up existing credentials first");
        await forceDisconnect.mutateAsync();
      } catch (error) {
        // Just log and continue even if this fails
        console.warn("X OAuth: Could not clean up credentials, continuing anyway:", error);
      }
      
      // Now start the actual auth flow
      console.log("X OAuth: Starting authorization flow");
      const response = await apiRequest<{ authUrl: string }>('GET', '/api/x/auth');
      return response;
    },
    onSuccess: (data) => {
      if (data?.authUrl) {
        console.log("X OAuth: Auth URL received from server");
        
        // Generate code verifier for PKCE
        // Note we're now using the fixed verifier function 
        // to match what the server expects
        const verifier = generateCodeVerifier();
        console.log("X OAuth: Code verifier generated:", {
          length: verifier.length
        });
        
        setCodeVerifier(verifier);
        setAuthUrl(data.authUrl);
        
        // Log the URL to help debug
        console.log("X OAuth: Authorization URL:", data.authUrl);
        
        // Extract state parameter from the URL for validation later
        try {
          const urlObj = new URL(data.authUrl);
          const state = urlObj.searchParams.get('state');
          console.log("X OAuth: State parameter from URL:", state);
        } catch (e) {
          console.error("X OAuth: Error parsing auth URL:", e);
        }
        
        // Open Twitter OAuth popup
        const width = 600;
        const height = 800; // Increased height for better visibility
        const left = window.innerWidth / 2 - width / 2;
        const top = window.innerHeight / 2 - height / 2;
        
        console.log("X OAuth: Opening popup window");
        const popup = window.open(
          data.authUrl,
          'x-oauth',
          `width=${width},height=${height},left=${left},top=${top}`
        );
        
        if (!popup) {
          console.error("X OAuth: Failed to open popup - it may have been blocked");
          toast({
            title: "Popup Blocked",
            description: "Please allow popups for this site to connect to X.com",
            variant: "destructive"
          });
          return;
        }
        
        // Check for redirect and extract code
        console.log("X OAuth: Starting popup checker");
        const checkPopup = setInterval(() => {
          if (!popup || popup.closed) {
            console.log("X OAuth: Popup was closed");
            clearInterval(checkPopup);
            return;
          }
          
          try {
            const currentUrl = popup.location.href;
            console.log("X OAuth: Checking popup URL:", currentUrl);
            
            if (currentUrl.includes('code=')) {
              console.log("X OAuth: Found authorization code in URL");
              clearInterval(checkPopup);
              
              // Parse the URL to extract both code and state
              const urlObj = new URL(currentUrl);
              const code = urlObj.searchParams.get('code');
              const state = urlObj.searchParams.get('state');
              
              console.log("X OAuth: Extracted parameters", { 
                hasCode: !!code, 
                codeLength: code?.length,
                hasState: !!state,
                stateLength: state?.length
              });
              
              if (code) {
                // Pass both code and state to handle callback
                handleAuthCallback(code, verifier, state);
                popup.close();
              } else {
                console.error("X OAuth: No code found in redirect URL");
                toast({
                  title: "Authentication Failed",
                  description: "No authorization code received from X.com",
                  variant: "destructive"
                });
              }
            }
          } catch (e) {
            // Cross-origin access will throw an error, ignore it
            // This is expected when the popup navigates to the Twitter domain
          }
        }, 500);
      } else {
        console.error("X OAuth: No auth URL in server response", data);
        toast({
          title: "Authorization Failed",
          description: "Could not initiate X.com authorization flow",
          variant: "destructive"
        });
      }
    },
    onError: (error) => {
      console.error("X OAuth: Error starting auth flow:", error);
      toast({
        title: "Authorization Failed",
        description: "Could not start X.com authorization flow",
        variant: "destructive"
      });
    }
  });

  // Handle authorization callback
  const handleAuthCallback = useCallback(async (code: string, verifier: string, state: string | null) => {
    try {
      console.log("X OAuth Callback: Received auth code, sending to server");
      console.log("Code length:", code.length);
      console.log("Verifier length:", verifier.length);
      console.log("State parameter:", state || "none provided");
      
      // Log the request we're about to make
      console.log("Making API request to /api/x/auth/callback with code, verifier and state");
      
      const response = await apiRequest('POST', '/api/x/auth/callback', 
        { code, codeVerifier: verifier, state: state || "state" }
      );
      
      console.log("X OAuth Callback: Server response received:", response);
      
      if (response?.success) {
        console.log("X OAuth Callback: Connection successful for user:", response.username);
        toast({
          title: "Connection Successful",
          description: `Connected to X.com as @${response.username}`,
          variant: "default"
        });
        
        // Refresh status
        queryClient.invalidateQueries({ queryKey: ['/api/x/status'] });
      } else {
        console.error("X OAuth Callback: Connection failed - no success in response", response);
        toast({
          title: "Connection Failed",
          description: "Could not complete X.com connection",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("X OAuth Callback: Error during API request:", error);
      toast({
        title: "Connection Failed",
        description: "Error completing X.com authorization",
        variant: "destructive"
      });
    }
  }, [queryClient, toast]);

  // Sync bookmarks from X.com
  const syncBookmarks = useMutation({
    mutationFn: async () => {
      try {
        const response = await fetch('/api/x/sync', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          // Check for auth error specifically
          if (response.status === 401 && data.action_required === 'reconnect') {
            throw new Error('auth_expired');
          }
          throw new Error(data.error || 'Failed to sync bookmarks');
        }
        
        return data;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/x/status'] });
      
      toast({
        title: "Bookmarks Synced",
        description: `Added ${data.added} new bookmarks, updated ${data.updated} existing bookmarks.`,
        variant: "default"
      });
    },
    onError: (error: any) => {
      console.error('Error syncing bookmarks:', error);
      
      // Check if this is an auth error
      if (error.message === 'auth_expired') {
        toast({
          title: "Authentication Expired",
          description: "Your X.com connection needs to be refreshed. Please reconnect.",
          variant: "destructive",
          action: (
            <ToastAction altText="Reconnect" onClick={() => startAuth.mutate()}>
              Reconnect
            </ToastAction>
          )
        });
      } else {
        toast({
          title: "Sync Failed",
          description: "Could not sync X.com bookmarks",
          variant: "destructive"
        });
      }
    }
  });
  
  // Sync bookmarks from a specific X.com folder
  const syncFolderBookmarks = useMutation({
    mutationFn: async (folderId: string) => {
      try {
        console.log(`Syncing bookmarks from folder: ${folderId}`);
        const response = await fetch(`/api/x/sync/folder/${folderId}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          // Check for auth error specifically
          if (response.status === 401 && data.action_required === 'reconnect') {
            throw new Error('auth_expired');
          }
          
          // Check for folder not found error
          if (response.status === 404 && data.error === 'Folder not found for this user') {
            throw new Error('folder_not_found');
          }
          
          throw new Error(data.error || 'Failed to sync folder bookmarks');
        }
        
        return data;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: (data, folderId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/x/status'] });
      
      // Find the folder name for better user feedback
      const folderName = folders?.find(f => f.id === folderId)?.name || folderId;
      
      toast({
        title: "Folder Bookmarks Synced",
        description: `Synced "${folderName}" folder: Added ${data.added} new bookmarks, updated ${data.updated} existing bookmarks.`,
        variant: "default"
      });
    },
    onError: (error: any, folderId) => {
      console.error(`Error syncing folder ${folderId} bookmarks:`, error);
      
      // Find the folder name for better user feedback
      const folderName = folders?.find(f => f.id === folderId)?.name || folderId;
      
      // Check if this is an auth error
      if (error.message === 'auth_expired') {
        toast({
          title: "Authentication Expired",
          description: "Your X.com connection needs to be refreshed. Please reconnect.",
          variant: "destructive",
          action: (
            <ToastAction altText="Reconnect" onClick={() => startAuth.mutate()}>
              Reconnect
            </ToastAction>
          )
        });
      } else if (error.message === 'folder_not_found') {
        toast({
          title: "Folder Not Found",
          description: `Could not find the folder "${folderName}" in your X.com account.`,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Sync Failed",
          description: `Could not sync bookmarks from "${folderName}" folder`,
          variant: "destructive"
        });
      }
    }
  });

  // Map folder to collection
  const mapFolder = useMutation({
    mutationFn: async (params: { 
      folderId: string, 
      folderName: string, 
      collectionId?: string, 
      createNew: boolean 
    }) => {
      const response = await apiRequest('POST', '/api/x/folders/map', params);
      return response;
    },
    onSuccess: () => {
      setIsMappingFolder(false);
      setSelectedFolder(null);
      setSelectedCollection(null);
      
      queryClient.invalidateQueries({ queryKey: ['/api/x/folders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collections'] });
      
      toast({
        title: "Folder Mapped",
        description: "X.com folder has been mapped to collection",
        variant: "default"
      });
    },
    onError: () => {
      toast({
        title: "Mapping Failed",
        description: "Could not map folder to collection",
        variant: "destructive"
      });
    }
  });

  const handleMapFolder = useCallback(() => {
    if (!selectedFolder) return;
    
    mapFolder.mutate({
      folderId: selectedFolder.id,
      folderName: selectedFolder.name,
      collectionId: createNewCollection ? undefined : selectedCollection || undefined,
      createNew: createNewCollection
    });
  }, [selectedFolder, createNewCollection, selectedCollection, mapFolder]);

  // Generate a fixed code verifier for PKCE that matches the server's version
  const generateCodeVerifier = () => {
    // This matches the server implementation in XService.generateCodeVerifier
    return "Y7$gVm29#pKfLq*1dC!xZehWTJr@u38oRnXs^BQa6E4NtiUw0+vYMkb9sjGl5HD%";
  };

  // Open folder mapping dialog
  const openMappingDialog = (folder: XFolder) => {
    setSelectedFolder(folder);
    setCreateNewCollection(!folder.mapped);
    setSelectedCollection(folder.collection_id || null);
    setIsMappingFolder(true);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Cable className="mr-2 h-5 w-5" />
          Connect to X
        </CardTitle>
        <CardDescription>
          Connect your X.com account to import your bookmarked tweets
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLoadingStatus ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !connectionStatus?.connected ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <p className="text-center text-muted-foreground">
              Connect your X.com account to import your bookmarked tweets.
            </p>
            <Button 
              onClick={() => startAuth.mutate()} 
              disabled={startAuth.isPending}
              className="mt-2"
            >
              {startAuth.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Loader2 className="mr-2 h-4 w-4" />
                  Connect to X.com
                </>
              )}
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="bookmarks">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
              <TabsTrigger value="folders">Folders</TabsTrigger>
            </TabsList>
            
            <TabsContent value="bookmarks" className="py-4">
                
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Connected as <span className="font-medium">@{connectionStatus.username}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Last synchronized: {connectionStatus.lastSync ? 
                    new Date(connectionStatus.lastSync).toLocaleString() : 'Never'}
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={() => syncBookmarks.mutate()} 
                  disabled={syncBookmarks.isPending}
                  className="w-full"
                >
                  {syncBookmarks.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing Bookmarks...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync X.com Bookmarks
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={() => startAuth.mutate()} 
                  disabled={startAuth.isPending}
                  variant="outline"
                  className="w-full"
                >
                  {startAuth.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-4 w-4" />
                      Reconnect to X.com
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  If syncing fails, try reconnecting to refresh your X.com access
                </p>
                
                <div className="text-xs text-muted-foreground space-y-1 p-2 border rounded-md mt-2">
                  <p>• Syncs bookmarks from both your main list and folders</p>
                  <p>• Only updates engagement metrics (likes, reposts) for existing bookmarks</p>
                  <p>• Your custom titles and descriptions are preserved</p>
                  <p>• Mapped folders will sync to their respective collections</p>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="folders" className="py-4">
              
              {isLoadingFolders ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !folders || folders.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">No folders found in your X.com account.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isLoadingFolders ? 
                      "Fetching folders, please wait..." :
                      "This could be because you hit X.com's rate limits. Please wait a moment before trying again."
                    }
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4" 
                    onClick={() => refetchFolders()}
                    disabled={isLoadingFolders}
                  >
                    {isLoadingFolders ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry Loading Folders
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium">Your Folders</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => refetchFolders()}
                      disabled={isLoadingFolders}
                    >
                      {isLoadingFolders ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="ml-2">
                        {isLoadingFolders ? "Loading..." : "Refresh"}
                      </span>
                    </Button>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    {folders.map(folder => (
                      <div key={folder.id} className="flex justify-between items-center p-2 rounded-md hover:bg-muted">
                        <div>
                          <p className="font-medium">{folder.name}</p>
                          {folder.mapped && (
                            <p className="text-xs text-muted-foreground">
                              Mapped to collection: {
                                collections?.find(c => c.id === folder.collection_id)?.name || 'Unknown'
                              }
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {folder.mapped && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => syncFolderBookmarks.mutate(folder.id)}
                              disabled={syncFolderBookmarks.isPending && syncFolderBookmarks.variables === folder.id}
                            >
                              {syncFolderBookmarks.isPending && syncFolderBookmarks.variables === folder.id ? (
                                <>
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <DownloadCloud className="mr-1 h-3 w-3" />
                                  Sync Folder
                                </>
                              )}
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant={folder.mapped ? "outline" : "default"}
                            onClick={() => openMappingDialog(folder)}
                          >
                            {folder.mapped ? (
                              <>
                                <Link className="mr-1 h-3 w-3" />
                                Remap
                              </>
                            ) : (
                              <>
                                <FolderPlus className="mr-1 h-3 w-3" />
                                Map to Collection
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      
      {/* Folder Mapping Dialog */}
      <Dialog open={isMappingFolder} onOpenChange={setIsMappingFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map X.com Folder</DialogTitle>
            <DialogDescription>
              Map the folder "{selectedFolder?.name}" to a collection in your bookmarks.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="create-new" 
                checked={createNewCollection} 
                onCheckedChange={(checked) => setCreateNewCollection(checked as boolean)} 
              />
              <Label htmlFor="create-new">Create a new collection with the same name</Label>
            </div>
            
            {!createNewCollection && collections && collections.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="collection-select">Select existing collection</Label>
                <Select 
                  value={selectedCollection || undefined} 
                  onValueChange={setSelectedCollection}
                >
                  <SelectTrigger id="collection-select">
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map(collection => (
                      <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMappingFolder(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleMapFolder} 
              disabled={mapFolder.isPending || (!createNewCollection && !selectedCollection)}
            >
              {mapFolder.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mapping...
                </>
              ) : (
                'Map Folder'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

/**
 * Return a fixed code verifier for PKCE OAuth flow
 * Using a static key provided for consistency
 */
function generateCodeVerifier() {
  return "Y7$gVm29#pKfLq*1dC!xZehWTJr@u38oRnXs^BQa6E4NtiUw0+vYMkb9sjGl5HD%";
}

export default XIntegrationPanel;