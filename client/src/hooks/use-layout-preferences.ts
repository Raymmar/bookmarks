import { useState, useEffect } from 'react';

interface LayoutPreferences {
  gridWidth: number;  // Percentage of width allocated to grid (remaining is for graph)
  showDetailPanel: boolean; // Whether to show the detail panel
}

const DEFAULT_PREFERENCES: LayoutPreferences = {
  gridWidth: 40, // 40% for grid, 60% for graph by default
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
    toggleDetailPanel,
  };
}