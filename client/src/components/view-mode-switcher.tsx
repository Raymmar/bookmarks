import { useState, useEffect } from 'react';
import { List, Grid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ViewModeSwitcherProps {
  onViewModeChange: (mode: 'list' | 'grid') => void;
  initialViewMode?: 'list' | 'grid';
}

export function ViewModeSwitcher({ onViewModeChange, initialViewMode = 'list' }: ViewModeSwitcherProps) {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(initialViewMode);

  // Initialize from localStorage on mount if available
  useEffect(() => {
    const savedViewMode = localStorage.getItem('bookmarkFeedViewMode');
    if (savedViewMode === 'list' || savedViewMode === 'grid') {
      setViewMode(savedViewMode);
    }
  }, []);

  // Update state and localStorage, and call the callback when viewMode changes
  const handleViewModeChange = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('bookmarkFeedViewMode', mode);
    onViewModeChange(mode);
  };

  return (
    <ToggleGroup type="single" value={viewMode} onValueChange={(value) => {
      if (value === 'list' || value === 'grid') {
        handleViewModeChange(value);
      }
    }}>
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Grid className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}