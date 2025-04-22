import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// Form validation schema
const settingSchema = z.object({
  value: z.string().min(20, "System prompt must be at least 20 characters"),
});

type Setting = {
  id: string;
  key: string;
  value: string;
  description: string;
  updated_at: string;
};

const SettingsPage: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("tagging");

  // Fetch all settings
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["/api/settings"],
    retry: 1,
  });

  // Prepare form for each setting
  const bookmarkSystemPromptForm = useForm({
    resolver: zodResolver(settingSchema),
    defaultValues: {
      value: "",
    },
  });

  const autoTaggingPromptForm = useForm({
    resolver: zodResolver(settingSchema),
    defaultValues: {
      value: "",
    },
  });

  const summaryPromptForm = useForm({
    resolver: zodResolver(settingSchema),
    defaultValues: {
      value: "",
    },
  });

  // Update forms when settings data is loaded
  React.useEffect(() => {
    if (settings) {
      // Find settings and update forms
      const bookmarkPrompt = settings.find((s: Setting) => s.key === "bookmark_system_prompt");
      const autoTagPrompt = settings.find((s: Setting) => s.key === "auto_tagging_prompt");
      const summaryPrompt = settings.find((s: Setting) => s.key === "summary_prompt");

      if (bookmarkPrompt) {
        bookmarkSystemPromptForm.reset({ value: bookmarkPrompt.value });
      }

      if (autoTagPrompt) {
        autoTaggingPromptForm.reset({ value: autoTagPrompt.value });
      }

      if (summaryPrompt) {
        summaryPromptForm.reset({ value: summaryPrompt.value });
      }
    }
  }, [settings, bookmarkSystemPromptForm, autoTaggingPromptForm, summaryPromptForm]);

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await fetch(`/api/settings/${key}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update setting");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings updated",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Form submission handlers
  const onBookmarkSystemPromptSubmit = (data: { value: string }) => {
    updateSettingMutation.mutate({ key: "bookmark_system_prompt", value: data.value });
  };

  const onAutoTaggingPromptSubmit = (data: { value: string }) => {
    updateSettingMutation.mutate({ key: "auto_tagging_prompt", value: data.value });
  };

  const onSummaryPromptSubmit = (data: { value: string }) => {
    updateSettingMutation.mutate({ key: "summary_prompt", value: data.value });
  };

  if (isLoading) {
    return <div className="container py-10">Loading settings...</div>;
  }

  if (error) {
    return (
      <div className="container py-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Failed to load settings. Please try again later.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-10 px-6">
      <div className="mx-auto max-w-[1280px]">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>
        <p className="text-muted-foreground mb-8">
          Customize the system prompts used for auto-tagging and summarization of your bookmarks.
        </p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="tagging">Auto-Tagging</TabsTrigger>
            <TabsTrigger value="summary">Summarization</TabsTrigger>
          </TabsList>

          <TabsContent value="tagging">
            <Card>
              <CardHeader>
                <CardTitle>Auto-Tagging Prompt</CardTitle>
                <CardDescription>
                  Configure the system prompt used for generating tags from bookmarks. This controls how the AI identifies relevant topics and keywords.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...autoTaggingPromptForm}>
                  <form onSubmit={autoTaggingPromptForm.handleSubmit(onAutoTaggingPromptSubmit)} className="space-y-4">
                    <FormField
                      control={autoTaggingPromptForm.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>System Prompt</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter auto-tagging prompt..." 
                              className="h-60 font-mono text-sm"
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            The output should be structured as a JSON array of tag strings.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      disabled={updateSettingMutation.isPending}
                    >
                      {updateSettingMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Summarization Prompt</CardTitle>
                <CardDescription>
                  Configure the system prompt used for generating summaries from bookmarks. This controls how the AI creates concise descriptions of saved content.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...summaryPromptForm}>
                  <form onSubmit={summaryPromptForm.handleSubmit(onSummaryPromptSubmit)} className="space-y-4">
                    <FormField
                      control={summaryPromptForm.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>System Prompt</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter summary prompt..." 
                              className="h-60 font-mono text-sm"
                              {...field} 
                            />
                          </FormControl>
                          <FormDescription>
                            Configure how detailed summaries should be and what information to focus on.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      disabled={updateSettingMutation.isPending}
                    >
                      {updateSettingMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator className="my-8" />

        <Card className="bg-muted/40">
          <CardHeader>
            <CardTitle>About System Prompts</CardTitle>
            <CardDescription>
              System prompts control how the AI processes your bookmarks
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="mb-4">
              These settings allow you to customize how the AI interprets and processes your bookmarks. 
              By modifying the system prompts, you can control:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Auto-Tagging:</strong> How tags are generated and what aspects of the content are prioritized for categorization.</li>
              <li><strong>Summarization:</strong> How detailed summaries are and what information is highlighted. This prompt is also used for generating insights and related information.</li>
            </ul>
            <p>
              Making changes to these prompts will affect how new bookmarks are processed. Existing bookmark data won't be updated automatically.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;