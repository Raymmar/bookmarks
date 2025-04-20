import { ReactNode, useState, createContext, useContext } from "react";
import { SidebarNavigation } from "@/components/sidebar-navigation";
import { MobileNavigation } from "@/components/mobile-navigation";
import { useLocation } from "wouter";

// Create a context for sharing filter state across components
interface FilterContextType {
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  tagMode: "any" | "all";
  setTagMode: (mode: "any" | "all") => void;
  sortOrder: string;
  setSortOrder: (order: string) => void;
  dateRange: string;
  setDateRange: (range: string) => void;
  sources: string[];
  setSources: (sources: string[]) => void;
  allTags: string[];
  setAllTags: (tags: string[]) => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();
  
  // Filter state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"any" | "all">("any");
  const [sortOrder, setSortOrder] = useState("newest");
  const [dateRange, setDateRange] = useState("week");
  const [sources, setSources] = useState<string[]>(["extension", "web", "import"]);
  const [allTags, setAllTags] = useState<string[]>([]);
  
  // Handle filter changes from the sidebar
  const handleFiltersChange = (filters: {
    tags: string[];
    dateRange: string;
    sources: string[];
    tagMode?: "any" | "all";
    sortOrder?: string;
  }) => {
    if (filters.tags) setSelectedTags(filters.tags);
    if (filters.dateRange) setDateRange(filters.dateRange);
    if (filters.sources) setSources(filters.sources);
    if (filters.tagMode) setTagMode(filters.tagMode);
    if (filters.sortOrder) setSortOrder(filters.sortOrder);
  };
  
  return (
    <FilterContext.Provider 
      value={{
        selectedTags, 
        setSelectedTags,
        tagMode,
        setTagMode,
        sortOrder,
        setSortOrder,
        dateRange,
        setDateRange,
        sources,
        setSources,
        allTags,
        setAllTags
      }}
    >
      <div className="flex h-screen w-full">
        {/* Sidebar Navigation - Hidden on Mobile */}
        <div className="hidden md:block w-64 h-full flex-shrink-0 border-r border-gray-200">
          <SidebarNavigation 
            allTags={allTags}
            onFiltersChange={handleFiltersChange}
          />
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
    </FilterContext.Provider>
  );
}
