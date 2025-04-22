import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Bookmark, 
  Waypoints, 
  Activity, 
  Bot, 
  Circle, 
  Settings, 
  User, 
  LogOut,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddBookmarkDialog } from "@/components/ui/add-bookmark-dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SidebarNavigationProps {
  className?: string;
}

export function SidebarNavigation({ className }: SidebarNavigationProps) {
  const [location] = useLocation();
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Get user initials for the avatar
  const getUserInitials = () => {
    if (!user) return "";
    return user.username.slice(0, 2).toUpperCase();
  };

  return (
    <nav className={cn("flex flex-col w-full h-full bg-white z-10", className)}>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center">
        <div className="flex items-center space-x-2">
          <Bookmark className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Atmosphere</h1>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-grow scrollbar-thin">
        <div className="p-4">
          <div className="mb-6">
            <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Dashboard</h2>
            <ul>
              <li className="mb-1">
                <Link href="/">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/" || location === "/graph"
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Waypoints className="h-5 w-5 mr-2" />
                    Explore
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/activity">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/activity" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Activity className="h-5 w-5 mr-2" />
                    Activity
                  </div>
                </Link>
              </li>
              <li className="mb-1">
                <Link href="/ai-chat">
                  <div className={cn(
                    "flex items-center px-2 py-2 text-sm rounded-lg",
                    location === "/ai-chat" 
                      ? "bg-primary text-white" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Bot className="h-5 w-5 mr-2" />
                    AI Chat
                  </div>
                </Link>
              </li>
              {user && (
                <li className="mb-1">
                  <Link href="/settings">
                    <div className={cn(
                      "flex items-center px-2 py-2 text-sm rounded-lg",
                      location === "/settings" 
                        ? "bg-primary text-white" 
                        : "text-gray-700 hover:bg-gray-100"
                    )}>
                      <Settings className="h-5 w-5 mr-2" />
                      Settings
                    </div>
                  </Link>
                </li>
              )}
            </ul>
          </div>
          
          {user && (
            <div className="mb-6">
              <h2 className="text-xs uppercase font-semibold text-gray-500 mb-2">Collections</h2>
              <ul className="space-y-1">
                <li>
                  <div className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                    <Circle className="h-4 w-4 mr-2 text-yellow-500 fill-yellow-500" />
                    Research Project
                  </div>
                </li>
                <li>
                  <div className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                    <Circle className="h-4 w-4 mr-2 text-green-500 fill-green-500" />
                    Web Development
                  </div>
                </li>
                <li>
                  <div className="flex items-center px-2 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer">
                    <Circle className="h-4 w-4 mr-2 text-blue-500 fill-blue-500" />
                    Machine Learning
                  </div>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-200">
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="p-2 hover:bg-gray-100 rounded-lg flex items-center">
                    <Avatar className="h-8 w-8 mr-2">
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                    <div className="text-sm font-medium truncate">
                      {user.username}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            
            <Button 
              className="w-full flex items-center justify-center"
              onClick={() => setAddBookmarkOpen(true)}
            >
              <Plus className="h-5 w-5 mr-2" />
              Add New Bookmark
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <div>
              <Button 
                className="w-full flex items-center justify-center"
              >
                <User className="h-5 w-5 mr-2" />
                Sign In
              </Button>
            </div>
          </Link>
        )}
      </div>

      <AddBookmarkDialog
        open={addBookmarkOpen}
        onOpenChange={setAddBookmarkOpen}
      />
    </nav>
  );
}
