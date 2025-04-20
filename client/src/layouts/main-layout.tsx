import { ReactNode } from "react";
import { SidebarNavigation } from "@/components/sidebar-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { BookmarkDetailPanel } from "@/components/bookmark-detail-panel";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null);
  const [location] = useLocation();
  
  const showDetail = location !== "/ai-chat" && location !== "/graph";
  
  const { data: bookmarks = [] } = useQuery({
    queryKey: ["/api/bookmarks"],
  });
  
  const selectedBookmark = bookmarks.find(b => b.id === selectedBookmarkId);
  
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
          
          {/* Detail Panel - Only show on specific pages and when a bookmark is selected */}
          {showDetail && selectedBookmark && (
            <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setSelectedBookmarkId(null)}>
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-white" onClick={e => e.stopPropagation()}>
                <BookmarkDetailPanel
                  bookmark={selectedBookmark}
                  onClose={() => setSelectedBookmarkId(null)}
                />
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Detail Panel - Desktop, shown selectively */}
      {showDetail && (
        <div className="hidden lg:block w-80 border-l border-gray-200 bg-white overflow-y-auto">
          <BookmarkDetailPanel
            bookmark={selectedBookmark}
            onClose={() => setSelectedBookmarkId(null)}
          />
        </div>
      )}
    </div>
  );
}
