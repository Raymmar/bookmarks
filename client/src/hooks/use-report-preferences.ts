import { useState, useEffect } from 'react';

export type ReportType = 'daily' | 'weekly';
export type ReadingLength = 'quick' | 'default' | 'deep';

export interface ReportLengthConfig {
  maxTokens: number;
  temperature: number;
  label: string;
}

export const READING_LENGTH_CONFIG: Record<ReadingLength, ReportLengthConfig> = {
  quick: {
    maxTokens: 2000,
    temperature: 0.5,
    label: "Quick Read"
  },
  default: {
    maxTokens: 4500,
    temperature: 0.6,
    label: "Default"
  },
  deep: {
    maxTokens: 8000,
    temperature: 0.7,
    label: "Deep Dive"
  }
};

interface ReportPreferences {
  reportType: ReportType;
  readingLength: ReadingLength;
}

const DEFAULT_PREFERENCES: ReportPreferences = {
  reportType: 'weekly',
  readingLength: 'default'
};

const STORAGE_KEY = 'report_preferences';

export function useReportPreferences() {
  const [preferences, setPreferences] = useState<ReportPreferences>(DEFAULT_PREFERENCES);
  
  // Load preferences from localStorage on initial render
  useEffect(() => {
    try {
      const storedPreferences = localStorage.getItem(STORAGE_KEY);
      if (storedPreferences) {
        const parsedPreferences = JSON.parse(storedPreferences) as Partial<ReportPreferences>;
        setPreferences(prev => ({
          ...prev,
          ...parsedPreferences
        }));
      }
    } catch (error) {
      console.error('Failed to load report preferences:', error);
    }
  }, []);
  
  // Save to localStorage whenever preferences change
  const savePreferences = (newPreferences: Partial<ReportPreferences>) => {
    const updatedPreferences = {
      ...preferences,
      ...newPreferences
    };
    
    setPreferences(updatedPreferences);
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPreferences));
    } catch (error) {
      console.error('Failed to save report preferences:', error);
    }
  };
  
  const setReportType = (type: ReportType) => {
    savePreferences({ reportType: type });
  };
  
  const setReadingLength = (length: ReadingLength) => {
    savePreferences({ readingLength: length });
  };
  
  return {
    reportType: preferences.reportType,
    readingLength: preferences.readingLength,
    setReportType,
    setReadingLength,
    readingLengthConfig: READING_LENGTH_CONFIG[preferences.readingLength]
  };
}