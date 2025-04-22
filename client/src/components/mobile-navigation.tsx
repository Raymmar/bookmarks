import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Bookmark, Home, FileText, Layers, HelpCircle, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { SidebarNavigation } from "./sidebar-navigation";

export function MobileNavigation() {
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Top navbar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-2">
            <Bookmark className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-semibold">Universal Bookmarks</h1>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="p-1">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarNavigation />
            </SheetContent>
          </Sheet>
        </div>
      </div>
      
      {/* Bottom mobile nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="flex justify-around">
          <Link href="/">
            <div className="flex flex-col items-center py-2 flex-1 cursor-pointer">
              <Home className={cn(
                "h-6 w-6",
                location === "/" ? "text-primary" : "text-gray-400"
              )} />
              <span className="text-xs text-gray-500">Home</span>
            </div>
          </Link>
          <Link href="/activity">
            <div className="flex flex-col items-center py-2 flex-1 cursor-pointer">
              <FileText className={cn(
                "h-6 w-6",
                location === "/activity" ? "text-primary" : "text-gray-400"
              )} />
              <span className="text-xs text-gray-500">Activity</span>
            </div>
          </Link>
          <Link href="/graph">
            <div className="flex flex-col items-center py-2 flex-1 cursor-pointer">
              <Layers className={cn(
                "h-6 w-6",
                location === "/graph" ? "text-primary" : "text-gray-400"
              )} />
              <span className="text-xs text-gray-500">Graph</span>
            </div>
          </Link>
          <Link href="/ai-chat">
            <div className="flex flex-col items-center py-2 flex-1 cursor-pointer">
              <HelpCircle className={cn(
                "h-6 w-6",
                location === "/ai-chat" ? "text-primary" : "text-gray-400"
              )} />
              <span className="text-xs text-gray-500">AI Chat</span>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
