import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
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
import { Loader2, RefreshCw, FolderPlus, Link, Twitter } from "lucide-react";

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
  const { data: connectionStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['/api/x/status'],
    queryFn: async () => {
      const response = await apiRequest<XConnectionStatus>('/api/x/status', { method: 'GET' });
      return response;
    },
    retry: false,
    refetchOnWindowFocus: false
  });

  // Fetch X.com folders if connected
  const { 
    data: folders, 
    isLoading: isLoadingFolders,
    refetch: refetchFolders 
  } = useQuery({
    queryKey: ['/api/x/folders'],
    queryFn: async () => {
      const response = await apiRequest<XFolder[]>('/api/x/folders', { method: 'GET' });
      return response;
    },
    enabled: !!connectionStatus?.connected,
    retry: false,
    refetchOnWindowFocus: false
  });

  // Fetch user collections for mapping
  const { 
    data: collections 
  } = useQuery({
    queryKey: ['/api/collections'],
    queryFn: async () => {
      const response = await apiRequest<Collection[]>('/api/collections', { method: 'GET' });
      return response;
    },
    retry: false,
    refetchOnWindowFocus: false
  });

  // Start X.com authorization flow
  const startAuth = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<{ authUrl: string }>('/api/x/auth', { method: 'GET' });
      return response;
    },
    onSuccess: (data) => {
      if (data?.authUrl) {
        // Generate code verifier for PKCE
        const verifier = generateCodeVerifier();
        setCodeVerifier(verifier);
        setAuthUrl(data.authUrl);
        
        // Open Twitter OAuth popup
        const width = 600;
        const height = 600;
        const left = window.innerWidth / 2 - width / 2;
        const top = window.innerHeight / 2 - height / 2;
        
        const popup = window.open(
          data.authUrl,
          'x-oauth',
          `width=${width},height=${height},left=${left},top=${top}`
        );
        
        // Check for redirect and extract code
        const checkPopup = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(checkPopup);
            return;
          }
          
          try {
            const currentUrl = popup.location.href;
            if (currentUrl.includes('code=')) {
              clearInterval(checkPopup);
              const code = new URL(currentUrl).searchParams.get('code');
              if (code) {
                handleAuthCallback(code, verifier);
                popup.close();
              }
            }
          } catch (e) {
            // Cross-origin access will throw an error, ignore it
          }
        }, 500);
      } else {
        toast({
          title: "Authorization Failed",
          description: "Could not initiate X.com authorization flow",
          variant: "destructive"
        });
      }
    },
    onError: () => {
      toast({
        title: "Authorization Failed",
        description: "Could not start X.com authorization flow",
        variant: "destructive"
      });
    }
  });

  // Handle authorization callback
  const handleAuthCallback = useCallback(async (code: string, verifier: string) => {
    try {
      const response = await apiRequest('/api/x/auth/callback', {
        method: 'POST',
        body: JSON.stringify({ code, codeVerifier: verifier })
      });
      
      if (response?.success) {
        toast({
          title: "Connection Successful",
          description: `Connected to X.com as @${response.username}`,
          variant: "default"
        });
        
        // Refresh status
        queryClient.invalidateQueries({ queryKey: ['/api/x/status'] });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not complete X.com connection",
          variant: "destructive"
        });
      }
    } catch (error) {
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
      const response = await apiRequest('/api/x/sync', { method: 'POST' });
      return response;
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
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Could not sync X.com bookmarks",
        variant: "destructive"
      });
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
      const response = await apiRequest('/api/x/folders/map', {
        method: 'POST',
        body: JSON.stringify(params)
      });
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

  // Generate a random code verifier for PKCE
  const generateCodeVerifier = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const randomValues = new Uint8Array(43);
    window.crypto.getRandomValues(randomValues);
    randomValues.forEach(v => result += chars[v % chars.length]);
    return result;
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
          <Twitter className="mr-2 h-5 w-5" />
          X.com Integration
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
                  <Twitter className="mr-2 h-4 w-4" />
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
            </TabsContent>
            
            <TabsContent value="folders" className="py-4">
              {isLoadingFolders ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !folders || folders.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">No folders found in your X.com account.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4" 
                    onClick={() => refetchFolders()}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Folders
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium">Your X.com Folders</h3>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => refetchFolders()}
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Refresh
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

export default XIntegrationPanel;