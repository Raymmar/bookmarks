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

// Report interface matches what we expect from the API
interface Report {
  id: string;
  title: string;
  content: string;
  user_id: string;
  created_at: string;
  time_period_start: Date | string; // Can be either Date or string when serialized
  time_period_end: Date | string;   // Can be either Date or string when serialized
  status: 'generating' | 'completed' | 'failed';
}

const Reports = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  
  // Fetch reports from API
  const { 
    data: reports, 
    isLoading: isLoadingReports,
    error: reportsError 
  } = useQuery<Report[]>({
    queryKey: ['/api/reports'],
    refetchInterval: 15000 // Refresh every 15 seconds to keep reports updated
  });

  // Fetch a specific report if one is selected
  const { 
    data: selectedReport,
    isLoading: isLoadingSelectedReport
  } = useQuery<Report>({
    queryKey: [`/api/reports/${selectedReportId}`], // Direct path to specific report
    enabled: !!selectedReportId, // Only run if we have a selected report ID
    onSuccess: (data) => {
      // Log the report data to see what we're getting
      console.log('Selected report data:', data);
      
      // Add detailed debugging information about the time period values
      console.log('Time period start (raw):', data.time_period_start);
      console.log('Time period start type:', typeof data.time_period_start);
      console.log('Time period start instanceof Date:', data.time_period_start instanceof Date);
      
      console.log('Time period end (raw):', data.time_period_end);
      console.log('Time period end type:', typeof data.time_period_end);
      console.log('Time period end instanceof Date:', data.time_period_end instanceof Date);
      
      // Try to manually convert to ensure it's a valid date
      try {
        const startDate = new Date(data.time_period_start);
        const endDate = new Date(data.time_period_end);
        console.log('Start date conversion result:', startDate);
        console.log('End date conversion result:', endDate);
        console.log('IsValid start:', !isNaN(startDate.getTime()));
        console.log('IsValid end:', !isNaN(endDate.getTime()));
      } catch (error) {
        console.error('Error converting dates:', error);
      }
    }
  });

  // Mutation for generating a new report
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      // Calculate date range (last week)
      const endDate = new Date();
      const startDate = subWeeks(endDate, 1);
      
      // Format dates as ISO strings
      const timePeriodStart = startDate.toISOString();
      const timePeriodEnd = endDate.toISOString();
      
      // Send request to generate report
      return apiRequest<Report>('/api/reports', {
        method: 'POST',
        data: {
          timePeriodStart,
          timePeriodEnd,
          maxBookmarks: 100
        }
      });
    },
    onSuccess: (newReport: Report) => {
      // Update reports list and select the new report
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      
      // Set the selected report ID
      setSelectedReportId(newReport.id);
      
      // Make sure we also invalidate the individual report query
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${newReport.id}`] });
      
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
    let dateRange = '';
    try {
      // Ensure time period values exist and are valid 
      if (report.time_period_start && report.time_period_end) {
        const startDate = new Date(report.time_period_start);
        const endDate = new Date(report.time_period_end);
        
        // Verify that the dates are valid
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          dateRange = `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
        } else {
          console.error("Invalid date objects created from report time periods");
          dateRange = 'Date range unavailable';
        }
      } else {
        console.error("Missing date values in formatted report");
        dateRange = 'Date range unavailable';
      }
    } catch (error) {
      console.error("Error formatting report dates:", error);
      dateRange = 'Date range unavailable';
    }

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
    let dateRange = '';
    try {
      // Ensure time period values exist and are valid 
      if (selectedReport.time_period_start && selectedReport.time_period_end) {
        const startDate = new Date(selectedReport.time_period_start);
        const endDate = new Date(selectedReport.time_period_end);
        
        // Verify that the dates are valid
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
          dateRange = `${format(startDate, 'MMMM d')} - ${format(endDate, 'MMMM d, yyyy')}`;
        } else {
          console.error("Invalid date objects created from report time periods");
          dateRange = 'Date range unavailable';
        }
      } else {
        console.error("Missing date values in formatted report");
        dateRange = 'Date range unavailable';
      }
    } catch (error) {
      console.error("Error formatting report dates:", error);
      dateRange = 'Date range unavailable';
    }

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
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6 px-2">
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
        <Alert variant="destructive" className="mb-6 mx-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load reports. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-2">
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
  );
};

export default Reports;