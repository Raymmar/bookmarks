import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

// Default prompts that match the backend defaults
const DEFAULT_TITLE_PROMPT = `You are a concise headline writer who creates accurate, descriptive titles.
Given a report about bookmarks, create a brief, engaging title that captures the essence of the content.
The title should be 8-12 words maximum and reflect the main themes or insights found in the report.
Focus on being specific and informative rather than generic.
DO NOT include phrases like "Daily Insights" or date ranges in your title.
Return ONLY the title with no additional text, quotes, or explanations.`;

interface ReportSettingsDialogProps {
  customTitlePrompt: string;
  onSaveSettings: (settings: { customTitlePrompt: string }) => void;
}

export function ReportSettingsDialog({
  customTitlePrompt,
  onSaveSettings,
}: ReportSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [localTitlePrompt, setLocalTitlePrompt] = useState(customTitlePrompt || DEFAULT_TITLE_PROMPT);
  
  const handleSave = () => {
    onSaveSettings({
      customTitlePrompt: localTitlePrompt,
    });
    setOpen(false);
  };
  
  const handleResetTitlePrompt = () => {
    setLocalTitlePrompt(DEFAULT_TITLE_PROMPT);
  };
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Generation Settings</DialogTitle>
          <DialogDescription>
            Customize how AI generates your reports.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="title" className="mt-4">
          <TabsList>
            <TabsTrigger value="title">Title Prompt</TabsTrigger>
          </TabsList>
          
          <TabsContent value="title" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title-prompt">
                Title Generation Prompt <span className="text-xs text-gray-500">(8-12 words)</span>
              </Label>
              <Textarea
                id="title-prompt"
                value={localTitlePrompt}
                onChange={(e) => setLocalTitlePrompt(e.target.value)}
                placeholder="Enter your custom title prompt..."
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                This prompt instructs the AI how to generate titles for your reports. The system will create a unique title based on the content of each report.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleResetTitlePrompt}
                className="mt-2"
              >
                Reset to Default
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}