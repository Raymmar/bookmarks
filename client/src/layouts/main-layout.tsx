import { ReactNode } from "react";
import { SidebarNavigation } from "@/components/sidebar-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Don't show navigation on auth page
  const isAuthPage = location === "/auth";
  
  if (isAuthPage) {
    return (
      <div className="flex h-screen w-full">
        <main className="flex-1 overflow-hidden w-full">
          {children}
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen w-full">
      {/* Sidebar Navigation - Hidden on Mobile */}
      <div className="hidden md:block w-64 h-full flex-shrink-0 border-r border-gray-200">
        <SidebarNavigation />
      </div>
      
      {/* Mobile Navigation */}
      <MobileNavigation />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col pt-16 md:pt-0 w-full">
        <main className="flex-1 flex overflow-hidden w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
