import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });
  
  const onSubmit = async (values: ForgotPasswordFormValues) => {
    try {
      const response = await apiRequest("POST", "/api/password/forgot", {
        email: values.email,
      });
      
      if (response.ok) {
        setEmailSent(true);
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to send password reset email.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error requesting password reset:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while requesting a password reset.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="mr-2 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
        </div>
        <CardDescription>
          Enter your email and we'll send you a password reset link
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {emailSent ? (
          <Alert className="bg-primary/10 border-primary">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertDescription>
              If an account exists with that email, we've sent password reset instructions. Please check your inbox and spam folder.
            </AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        type="email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Sending..."
                  : "Send Reset Link"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
      {emailSent && (
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={onBack}>
            Back to Login
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}