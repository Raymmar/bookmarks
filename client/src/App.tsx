import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Activity from "@/pages/activity";
import Feed from "@/pages/feed";
import GraphView from "@/pages/graph-view";
import AiChat from "@/pages/ai-chat";
import Settings from "@/pages/settings";
import XIntegration from "@/pages/x-integration";
import Reports from "@/pages/reports";
import AuthPage from "@/pages/auth-page";
import VerifyEmail from "@/pages/verify-email";
import ResetPassword from "@/pages/reset-password";
import CollectionPage from "@/pages/collection";
import MainLayout from "@/layouts/main-layout";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Feed} />
      <Route path="/graph" component={GraphView} />
      <Route path="/feed" component={Feed} />
      <Route path="/activity" component={Activity} />
      <Route path="/ai-chat" component={AiChat} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/x-integration" component={XIntegration} />
      <ProtectedRoute path="/reports" component={Reports} />
      <Route path="/collection/:name" component={CollectionPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <MainLayout>
            <Router />
          </MainLayout>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
