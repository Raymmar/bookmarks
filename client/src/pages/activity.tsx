import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActivityFeed } from "@/components/activity-feed";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function Activity() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["/api/activities"],
  });

  const filteredActivities = activities.filter(activity => {
    // Filter by search query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        (activity.bookmark_title && activity.bookmark_title.toLowerCase().includes(searchLower)) ||
        (activity.content && activity.content.toLowerCase().includes(searchLower)) ||
        (activity.tags && activity.tags.some(tag => tag.toLowerCase().includes(searchLower)));
      
      if (!matchesSearch) return false;
    }
    
    // Filter by activity type
    if (activityType !== "all" && activity.type !== activityType) {
      return false;
    }
    
    // Filter by date range
    if (dateRange !== "all") {
      const activityDate = new Date(activity.timestamp);
      const now = new Date();
      
      if (dateRange === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (activityDate < today) return false;
      } else if (dateRange === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (activityDate < weekAgo) return false;
      } else if (dateRange === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        if (activityDate < monthAgo) return false;
      }
    }
    
    return true;
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* Header & Controls */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0">
          <div className="relative flex-1 max-w-2xl">
            <Input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2"
            />
            <SearchX className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
          
          <div className="flex items-center space-x-2">
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Activity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                <SelectItem value="bookmark_added">Bookmarks</SelectItem>
                <SelectItem value="note_added">Notes</SelectItem>
                <SelectItem value="highlight_added">Highlights</SelectItem>
                <SelectItem value="insight_generated">Insights</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">Past Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 p-4 pb-20 bg-gray-50 overflow-y-auto">
        
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="h-8 w-8 border-4 border-t-primary rounded-full animate-spin mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading activities...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow text-center">
            <SearchX className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No activities found</h3>
            <p className="text-gray-500">
              {searchQuery || activityType !== "all" || dateRange !== "all"
                ? "Try adjusting your filters to see more results"
                : "Start by adding bookmarks, notes, or highlights"}
            </p>
          </div>
        ) : (
          <ActivityFeed activities={filteredActivities} />
        )}
      </div>
    </div>
  );
}
