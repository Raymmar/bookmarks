import { useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from '../lib/queryClient';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// Define the password reset schema
const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long"),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const ResetPassword = () => {
  const [match, params] = useRoute('/reset-password');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [status, setStatus] = useState<'form' | 'success' | 'error'>('form');
  const [message, setMessage] = useState('');
  
  // Get token from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });
  
  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) {
      setStatus('error');
      setMessage('No reset token found. Please request a new password reset link.');
      return;
    }
    
    try {
      const response = await apiRequest('POST', '/api/password/reset', {
        token,
        password: values.password,
      });
      
      if (response.ok) {
        setStatus('success');
        const data = await response.json();
        setMessage(data.message || 'Your password has been successfully reset!');
      } else {
        const errorData = await response.json();
        setStatus('error');
        setMessage(errorData.message || 'Failed to reset your password. The token may be invalid or expired.');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while resetting your password.",
        variant: "destructive",
      });
    }
  };
  
  // If no token is provided, show an error
  if (!token && status === 'form') {
    setStatus('error');
    setMessage('No reset token found. Please request a new password reset link.');
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>
            Create a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'form' && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
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
                  {form.formState.isSubmitting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </form>
            </Form>
          )}
          
          {status === 'success' && (
            <Alert className="bg-primary/10 border-primary mb-4">
              <CheckCircle className="h-5 w-5 text-primary" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          
          {status === 'error' && (
            <Alert className="bg-destructive/10 border-destructive mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <AlertTitle>Reset Failed</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          {(status === 'success' || status === 'error') && (
            <Button onClick={() => navigate('/auth')}>
              Return to Login
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default ResetPassword;