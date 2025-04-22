import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserProfile() {
  const { user, logoutMutation } = useAuth();

  if (!user) {
    return (
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-gray-200 text-gray-500">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <Link href="/auth">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center justify-between w-full bg-gray-50 hover:bg-gray-100 p-2"
          >
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {user.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-sm font-medium">{user.username}</p>
                <p className="text-xs text-gray-500 truncate max-w-[120px]">
                  {user.email}
                </p>
              </div>
            </div>
            <div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 8.5L10 4.5L9.1 3.6L6 6.7L2.9 3.6L2 4.5L6 8.5Z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <Link href="/settings">
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
          </Link>
          <DropdownMenuItem
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>{logoutMutation.isPending ? "Logging out..." : "Logout"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}