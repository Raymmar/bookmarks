import { Activity } from "@shared/types";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Pencil, FileText, Lightbulb } from "lucide-react";

interface ActivityFeedProps {
  activities: Activity[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        No activity yet
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute top-0 left-4 w-0.5 h-full bg-gray-200"></div>
          
          {/* Activity Items */}
          <div className="space-y-6 relative pl-10">
            {activities.map((activity) => (
              <div key={activity.id}>
                <div className="absolute -left-1 mt-1.5 w-10 h-10 rounded-full flex items-center justify-center" 
                  style={{ 
                    backgroundColor: getActivityIconBgColor(activity.type),
                  }}
                >
                  {getActivityIcon(activity.type)}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {getActivityTitle(activity)}
                    {" "}
                    <Link href={`/bookmark/${activity.bookmarkId}`} className="text-primary hover:underline">
                      {activity.bookmarkTitle}
                    </Link>
                  </p>
                  
                  {activity.content && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
                      "{activity.content}"
                    </div>
                  )}
                  
                  {activity.tags && activity.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activity.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="bg-indigo-100 text-indigo-800">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">{formatDate(activity.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getActivityTitle(activity: Activity): string {
  switch (activity.type) {
    case "bookmark_added":
      return "Bookmarked";
    case "note_added":
      return "Added a note to";
    case "highlight_added":
      return "Highlighted content in";
    case "insight_generated":
      return "Generated insights for";
    default:
      return "Updated";
  }
}

function getActivityIcon(type: string) {
  switch (type) {
    case "bookmark_added":
      return <Bookmark className="h-5 w-5 text-primary" />;
    case "note_added":
      return <FileText className="h-5 w-5 text-yellow-500" />;
    case "highlight_added":
      return <Pencil className="h-5 w-5 text-orange-500" />;
    case "insight_generated":
      return <Lightbulb className="h-5 w-5 text-green-500" />;
    default:
      return <Bookmark className="h-5 w-5 text-gray-500" />;
  }
}

function getActivityIconBgColor(type: string): string {
  switch (type) {
    case "bookmark_added":
      return "#e0e7ff"; // indigo-100
    case "note_added":
      return "#fef3c7"; // yellow-100
    case "highlight_added":
      return "#ffedd5"; // orange-100
    case "insight_generated":
      return "#d1fae5"; // green-100
    default:
      return "#f3f4f6"; // gray-100
  }
}
