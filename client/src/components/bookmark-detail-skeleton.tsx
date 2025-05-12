import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookmarkDetailSkeletonProps {
  onClose: () => void;
  title?: string | null;
  url?: string | null;
}

export function BookmarkDetailSkeleton({ onClose, title, url }: BookmarkDetailSkeletonProps) {
  return (
    <>
      <div className="h-16 p-4 border-b border-gray-200 flex items-center sticky top-0 bg-white z-10">
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      <div className="p-4 overflow-auto h-[calc(100vh-64px)]">
        {/* Title - show actual title if available or skeleton */}
        <div className="mb-4">
          <div className="font-medium text-base mb-1 border-b border-transparent">
            {title ? (
              <div className="w-full py-1">{title}</div>
            ) : (
              <Skeleton className="w-full h-6" />
            )}
          </div>
        </div>
        
        {/* URL - show actual URL if available or skeleton */}
        <div className="mb-4 text-sm text-gray-500 break-all">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              {url}
            </a>
          ) : (
            <Skeleton className="w-3/4 h-4" />
          )}
        </div>
        
        {/* Tags section skeleton */}
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Tags</div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-14" />
          </div>
        </div>
        
        {/* Notes section skeleton */}
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Notes</div>
          <Skeleton className="h-20 w-full" />
        </div>
        
        {/* Collections section skeleton */}
        <div className="mb-4">
          <div className="text-sm font-medium mb-2">Collections</div>
          <Skeleton className="h-8 w-full" />
        </div>
        
        {/* AI Insights section skeleton */}
        <div className="mt-6">
          <div className="text-sm font-medium mb-2">AI Insights</div>
          <Skeleton className="h-16 w-full mb-2" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </>
  );
}