import { useEffect, useState } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from '../lib/queryClient';

const VerifyEmail = () => {
  const [match, params] = useRoute('/verify-email');
  const [, navigate] = useLocation();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  
  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (!token) {
          setStatus('error');
          setMessage('No verification token found in the URL.');
          return;
        }
        
        // Call the API to verify the email
        const response = await apiRequest('GET', `/api/email/verify?token=${token}`);
        
        if (response.ok) {
          setStatus('success');
          const data = await response.json();
          setMessage(data.message || 'Your email has been successfully verified!');
        } else {
          const errorData = await response.json();
          setStatus('error');
          setMessage(errorData.message || 'Failed to verify your email. The token may be invalid or expired.');
        }
      } catch (error) {
        console.error('Error verifying email:', error);
        setStatus('error');
        setMessage('An unexpected error occurred while verifying your email.');
      }
    };
    
    verifyEmail();
  }, []);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>
            Verify your email address to fully access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <p className="text-center text-muted-foreground">{message}</p>
            </div>
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
              <AlertTitle>Verification Failed</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {status === 'success' && (
            <Button className="w-full" onClick={() => navigate('/')}>
              Go to Dashboard
            </Button>
          )}
          
          {status === 'error' && (
            <div className="w-full space-y-2">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => navigate('/auth')}
              >
                Return to Login
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                Need a new verification link? <Link href="/auth"><a className="text-primary hover:underline">Sign in</a></Link> and request one.
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default VerifyEmail;