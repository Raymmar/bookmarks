import { useState, useEffect } from 'react';

export type ReportType = 'daily' | 'weekly';

interface ReportPreferences {
  reportType: ReportType;
}

const DEFAULT_PREFERENCES: ReportPreferences = {
  reportType: 'weekly', // Default to weekly reports
};

export function useReportPreferences() {
  const [preferences, setPreferences] = useState<ReportPreferences>(() => {
    // Initialize from localStorage or use defaults
    const savedPrefs = localStorage.getItem('reportPreferences');
    if (savedPrefs) {
      try {
        return JSON.parse(savedPrefs);
      } catch (e) {
        console.error('Failed to parse saved report preferences:', e);
        return DEFAULT_PREFERENCES;
      }
    }
    return DEFAULT_PREFERENCES;
  });

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('reportPreferences', JSON.stringify(preferences));
  }, [preferences]);

  // Update report type
  const setReportType = (type: ReportType) => {
    setPreferences(prev => ({
      ...prev,
      reportType: type,
    }));
  };

  return {
    preferences,
    setReportType,
  };
}