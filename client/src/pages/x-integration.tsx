import XIntegrationPanel from "@/components/x-integration-panel";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { useLocation } from "wouter";

const XIntegrationPage = () => {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex h-full items-center justify-center">
          <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">

        <div className="grid gap-6">
          <XIntegrationPanel />
          
          <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
            <h3 className="font-medium mb-2">About X.com Integration</h3>
            <p className="mb-2">
              Connect with x.com to import your bookmarks and folders.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Bookmarks will be imported as links to the original tweet</li>
              <li>Tweet text, author, engagement metrics and more are saved with each bookmark</li>
              <li>Map your folders to collections</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default XIntegrationPage;