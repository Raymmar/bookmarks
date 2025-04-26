import { useState, useEffect } from 'react';

interface LayoutPreferences {
  gridWidth: number;  // Percentage of width allocated to grid (remaining is for graph)
  gridColumns: number; // Number of columns in the grid (1-4)
  showDetailPanel: boolean; // Whether to show the detail panel
}

const DEFAULT_PREFERENCES: LayoutPreferences = {
  gridWidth: 40, // 40% for grid, 60% for graph by default
  gridColumns: 2, // 2 columns by default
  showDetailPanel: false, // Hidden by default
};

export function useLayoutPreferences() {
  const [preferences, setPreferences] = useState<LayoutPreferences>(() => {
    // Initialize from localStorage or use defaults
    const savedPrefs = localStorage.getItem('layoutPreferences');
    if (savedPrefs) {
      try {
        return JSON.parse(savedPrefs);
      } catch (e) {
        console.error('Failed to parse saved layout preferences:', e);
        return DEFAULT_PREFERENCES;
      }
    }
    return DEFAULT_PREFERENCES;
  });

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('layoutPreferences', JSON.stringify(preferences));
  }, [preferences]);

  // Update grid width
  const setGridWidth = (width: number) => {
    setPreferences(prev => ({
      ...prev,
      gridWidth: Math.max(20, Math.min(80, width)), // Restrict between 20% and 80%
    }));
  };

  // Update grid columns
  const setGridColumns = (columns: number) => {
    setPreferences(prev => ({
      ...prev,
      gridColumns: Math.max(1, Math.min(4, columns)), // Restrict between 1 and 4 columns
    }));
  };

  // Toggle detail panel
  const toggleDetailPanel = (show?: boolean) => {
    setPreferences(prev => ({
      ...prev,
      showDetailPanel: show !== undefined ? show : !prev.showDetailPanel,
    }));
  };

  return {
    preferences,
    setGridWidth,
    setGridColumns,
    toggleDetailPanel,
  };
}