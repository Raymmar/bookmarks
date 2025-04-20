import { ReactNode } from "react";
import { SidebarNavigation } from "@/components/sidebar-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  
  return (
    <div className="flex h-screen">
      {/* Sidebar Navigation - Hidden on Mobile */}
      <div className="hidden md:block">
        <SidebarNavigation />
      </div>
      
      {/* Mobile Navigation */}
      <MobileNavigation />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-64 md:pl-0 pt-16 md:pt-0">
        <main className="flex-1 flex overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
