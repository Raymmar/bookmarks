import MainLayout from "@/layouts/main-layout";
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
      <MainLayout>
        <div className="container p-4 mx-auto">
          <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
            <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">X.com Integration</h1>
          <p className="text-muted-foreground">
            Connect to X.com to import your bookmarked tweets and organize them with your other bookmarks.
          </p>
        </div>

        <div className="grid gap-6">
          <XIntegrationPanel />
          
          <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
            <h3 className="font-medium mb-2">About X.com Integration</h3>
            <p className="mb-2">
              This integration allows you to import your bookmarked tweets and organize them in collections.
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Bookmarked tweets will be imported as links to the original tweet</li>
              <li>Tweet text, author, and engagement metrics are saved with each bookmark</li>
              <li>X.com folders can be mapped to your bookmark collections</li>
              <li>You can sync your bookmarks manually whenever you want</li>
            </ul>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default XIntegrationPage;