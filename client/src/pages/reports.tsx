import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient, Query, QueryKey } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, subWeeks } from 'date-fns';
import ReactMarkdown from 'react-markdown';

// UI Components
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Alert,
  AlertDescription,
  AlertTitle 
} from '@/components/ui/alert';
import { AlertCircle, Calendar, FileText, RefreshCw } from 'lucide-react';
import MainLayout from '@/layouts/main-layout';

// Report interface matches what we expect from the API
interface Report {
  id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  time_period_start: string;
  time_period_end: string;
  status: 'generating' | 'completed' | 'failed';
}

const Reports = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  
  // Fetch reports from API
  const { 
    data: reports = [], 
    isLoading: isLoadingReports,
    error: reportsError 
  } = useQuery({
    queryKey: ['reports'],
    queryFn: async (): Promise<Report[]> => {
      try {
        const response = await fetch('/api/reports');
        if (!response.ok) {
          throw new Error('Failed to fetch reports');
        }
        const data = await response.json();
        return data || [];
      } catch (error) {
        console.error('Error fetching reports:', error);
        return [];
      }
    },
    refetchInterval: 15000 // Refresh every 15 seconds to keep reports updated
  });

  // Fetch a specific report if one is selected
  const { 
    data: selectedReport,
    isLoading: isLoadingSelectedReport
  } = useQuery({
    queryKey: ['report', selectedReportId],
    queryFn: async (): Promise<Report | null> => {
      if (!selectedReportId) return null;
      
      try {
        const response = await fetch(`/api/reports/${selectedReportId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch report');
        }
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error fetching report:', error);
        return null;
      }
    },
    enabled: !!selectedReportId // Only run if we have a selected report ID
  });

  // Mutation for generating a new report
  const generateReportMutation = useMutation<
    Report, 
    Error, 
    void, 
    { previousReports: Report[] | undefined }
  >({
    mutationFn: async () => {
      // Calculate date range (last week)
      const endDate = new Date();
      const startDate = subWeeks(endDate, 1);
      
      // Format dates as ISO strings
      const timePeriodStart = startDate.toISOString();
      const timePeriodEnd = endDate.toISOString();
      
      // Send request to generate report
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timePeriodStart,
          timePeriodEnd,
          maxBookmarks: 100
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate report');
      }
      
      const data = await response.json();
      return data as Report;
    },
    onSuccess: (newReport: Report) => {
      // Update reports list and select the new report
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSelectedReportId(newReport.id);
      
      toast({
        title: "Report generation started",
        description: "Your weekly report is being generated and will be available shortly."
      });
    },
    onError: (error) => {
      console.error("Error generating report:", error);
      toast({
        title: "Failed to generate report",
        description: "An error occurred while trying to generate your report. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Handle generating a new report
  const handleGenerateReport = () => {
    generateReportMutation.mutate();
  };

  // Render a report list item
  const renderReportItem = (report: Report) => {
    const isSelected = selectedReportId === report.id;
    const statusLabel = {
      'generating': 'Generating...',
      'completed': 'Completed',
      'failed': 'Failed'
    }[report.status];

    const statusClass = {
      'generating': 'text-yellow-500',
      'completed': 'text-green-500',
      'failed': 'text-red-500'
    }[report.status];

    // Format dates for display
    const startDate = new Date(report.time_period_start);
    const endDate = new Date(report.time_period_end);
    const dateRange = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;

    return (
      <div 
        key={report.id}
        className={`p-4 border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
          isSelected ? 'bg-gray-100 dark:bg-gray-800' : ''
        }`}
        onClick={() => setSelectedReportId(report.id)}
      >
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">{report.title}</h3>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Calendar className="w-4 h-4" /> 
              {dateRange}
            </div>
          </div>
          <div className={`text-sm font-medium ${statusClass}`}>
            {statusLabel}
          </div>
        </div>
      </div>
    );
  };

  // Render skeleton loaders for the report list
  const renderReportSkeletons = () => {
    return Array(3).fill(null).map((_, i) => (
      <div key={i} className="p-4 border-b">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    ));
  };

  // Render the report content (markdown)
  const renderReportContent = () => {
    if (!selectedReport) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <FileText className="w-20 h-20 text-gray-300 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Report Selected</h3>
          <p className="text-gray-500 mb-6">Select a report from the list or generate a new one.</p>
          <Button onClick={handleGenerateReport} disabled={generateReportMutation.isPending}>
            Generate Weekly Report
          </Button>
        </div>
      );
    }

    if (selectedReport.status === 'generating') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <RefreshCw className="w-20 h-20 text-yellow-500 mb-4 animate-spin" />
          <h3 className="text-xl font-medium mb-2">Generating Your Report</h3>
          <p className="text-gray-500">
            We're analyzing your bookmarks and generating insights. This may take a minute or two.
          </p>
        </div>
      );
    }

    if (selectedReport.status === 'failed') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <AlertCircle className="w-20 h-20 text-red-500 mb-4" />
          <h3 className="text-xl font-medium mb-2">Report Generation Failed</h3>
          <p className="text-gray-500 mb-6">
            There was an error generating your report. Please try again.
          </p>
          <Button onClick={handleGenerateReport} disabled={generateReportMutation.isPending}>
            Try Again
          </Button>
        </div>
      );
    }

    // Format dates for display
    const startDate = new Date(selectedReport.time_period_start);
    const endDate = new Date(selectedReport.time_period_end);
    const dateRange = `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;

    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-2">{selectedReport.title}</h2>
        <div className="text-sm text-gray-500 mb-6 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> 
          {dateRange}
        </div>
        
        <div className="prose dark:prose-invert max-w-none">
          <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <MainLayout>
      {/* Main content - ensure this is the only content rendered inside MainLayout */}
      <div className="h-full w-full overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Weekly Insights Reports</h1>
            <Button 
              onClick={handleGenerateReport}
              disabled={generateReportMutation.isPending}
            >
              {generateReportMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate New Report'
              )}
            </Button>
          </div>

          {reportsError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                Failed to load reports. Please try refreshing the page.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Reports list panel */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Your Reports</CardTitle>
                <CardDescription>
                  View insights from your saved content
                </CardDescription>
              </CardHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                {isLoadingReports ? (
                  renderReportSkeletons()
                ) : reports && reports.length > 0 ? (
                  reports.map(renderReportItem)
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    No reports yet. Generate your first report.
                  </div>
                )}
              </div>
            </Card>

            {/* Report content panel */}
            <Card className="lg:col-span-2">
              <div className="min-h-[60vh] max-h-[80vh] overflow-y-auto">
                {isLoadingSelectedReport ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/3 mb-6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ) : (
                  renderReportContent()
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Reports;