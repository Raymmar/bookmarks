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
            <ul className="list-disc list-inside space-y-1">
              <li>Due to limitations of the x API, we may not be able to import all of your bookmarks.</li>
              <li>As long as your x account is connected your new bookmarks will sync automatically every (x) hours.</li>
              <li>The x API only returns your 20 most recent active folders.</li>
              <li>Map folders from x.com to collections in atmosphere to explore folders visually.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default XIntegrationPage;