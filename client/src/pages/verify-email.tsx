import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertTriangle, LogIn } from "lucide-react";
import { apiRequest } from '../lib/queryClient';
import { queryClient } from '../lib/queryClient';

const VerifyEmail = () => {
  const [match, params] = useRoute('/verify-email');
  const [, navigate] = useLocation();
  
  // Add already-verified state to handle tokens that have been used before
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already-verified'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  
  useEffect(() => {
    console.log("VerifyEmail component mounted, starting verification process");
    
    const verifyEmail = async () => {
      try {
        // Get token from URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        console.log("Verifying with token:", token ? "token present" : "no token");
        
        if (!token) {
          setStatus('error');
          setMessage('No verification token found in the URL.');
          return;
        }
        
        // Call the API to verify the email
        console.log("Making API request to verify email");
        const response = await apiRequest('GET', `/api/email/verify?token=${token}`);
        console.log("Verification API response status:", response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log("Verification successful, received data:", data ? "data present" : "no data");
          
          setStatus('success');
          setMessage(data.message || 'Your email has been successfully verified!');
          
          // Update the user data in the client cache
          if (data.user) {
            console.log("Updating client cache with user data");
            queryClient.setQueryData(['/api/user'], data.user);
            
            // Force a refetch of the user data to ensure we have the latest
            queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          }
          
          // Automatically redirect to the home page since the user is now logged in
          console.log("Scheduling redirect to homepage");
          setTimeout(() => {
            navigate('/', { 
              state: { 
                message: "Your email has been verified. Welcome to Atmosphere!",
                type: "success" 
              } 
            });
          }, 2000);
        } else {
          let errorMessage = 'Failed to verify your email. The token may be invalid or expired.';
          let isAlreadyVerified = false;
          
          try {
            const errorData = await response.json();
            console.log("Verification error response:", errorData);
            
            if (errorData && errorData.message) {
              errorMessage = errorData.message;
              
              // Check if the error indicates this email is already verified
              if (errorData.message.toLowerCase().includes('already verified')) {
                isAlreadyVerified = true;
                errorMessage = "This email has already been verified.";
              }
            }
          } catch (parseError) {
            console.error('Error parsing error response:', parseError);
          }
          
          setStatus(isAlreadyVerified ? 'already-verified' : 'error');
          setMessage(errorMessage);
        }
      } catch (error) {
        console.error('Error verifying email:', error);
        setStatus('error');
        setMessage('An unexpected error occurred while verifying your email.');
      }
    };
    
    verifyEmail();
  }, [navigate]);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>
            Verify your email address to access your account
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
          
          {status === 'already-verified' && (
            <Alert className="bg-yellow-100/70 border-yellow-400 mb-4">
              <CheckCircle className="h-5 w-5 text-yellow-600" />
              <AlertTitle>Already Verified</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          {status === 'success' && (
            <p className="text-center w-full text-muted-foreground">
              Redirecting you to your dashboard...
            </p>
          )}
          
          {status === 'already-verified' && (
            <Button 
              className="w-full flex items-center justify-center gap-2" 
              onClick={() => navigate('/auth')}
            >
              <LogIn className="h-4 w-4" />
              Log in to your account
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
                If you need assistance, please contact support.
              </div>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default VerifyEmail;