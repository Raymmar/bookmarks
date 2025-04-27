import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertTriangle, LogIn } from "lucide-react";
import { queryClient } from '../lib/queryClient';

const VerifyEmail = () => {
  const [match, params] = useRoute('/verify-email');
  const [, navigate] = useLocation();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'already-verified'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  
  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get token from URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        console.log("[VERIFY] Token from URL:", token ? "Token exists" : "No token");
        
        if (!token) {
          setStatus('error');
          setMessage('No verification token found in the URL.');
          return;
        }
        
        // CRITICAL FIX: Use fetch directly instead of apiRequest which throws exceptions
        console.log("[VERIFY] Making direct fetch request to API");
        try {
          const response = await fetch(`/api/email/verify?token=${token}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          console.log("[VERIFY] API Response Status:", response.status);
          const data = await response.json();
          console.log("[VERIFY] API Response Data:", data);
          
          if (response.ok) {
            console.log("[VERIFY] Verification successful");
            setStatus('success');
            setMessage(data.message || 'Your email has been successfully verified!');
            
            // Update the auth state with the returned user
            if (data.user) {
              console.log("[VERIFY] Setting user data in cache");
              queryClient.setQueryData(['/api/user'], data.user);
              
              // Force refetch of user data and related queries
              queryClient.invalidateQueries({ queryKey: ['/api/user'] });
            }
            
            // Redirect to homepage after successful verification
            console.log("[VERIFY] Setting timeout for redirect");
            setTimeout(() => {
              console.log("[VERIFY] Redirecting to homepage");
              navigate('/', { 
                replace: true, // Use replace to prevent back navigation to verification page
                state: { 
                  message: "Your email has been verified. Welcome to Atmosphere!",
                  type: "success" 
                } 
              });
            }, 2000);
          } else {
            // Handle error responses
            console.log("[VERIFY] Error response from API:", data);
            
            if (data.alreadyVerified) {
              console.log("[VERIFY] User already verified");
              setStatus('already-verified');
              setMessage(data.message || 'This email has already been verified.');
              
              // Try to set user data if we have it from an already-verified user
              if (data.user) {
                console.log("[VERIFY] Setting already-verified user data in cache");
                queryClient.setQueryData(['/api/user'], data.user);
                queryClient.invalidateQueries({ queryKey: ['/api/user'] });
              }
            } else {
              console.log("[VERIFY] Verification failed:", data.message);
              setStatus('error');
              setMessage(data.message || 'Failed to verify your email. The token may be invalid or expired.');
            }
          }
        } catch (fetchError) {
          console.error('[VERIFY] Error during fetch:', fetchError);
          setStatus('error');
          setMessage('An unexpected error occurred while contacting the server.');
        }
      } catch (error) {
        console.error('[VERIFY] Unexpected outer error:', error);
        setStatus('error');
        setMessage('An unexpected error occurred while verifying your email.');
      }
    };
    
    console.log("[VERIFY] Component mounted, starting verification");
    verifyEmail();
  }, [navigate]);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md mx-4">
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
              onClick={() => navigate('/')}
            >
              <LogIn className="h-4 w-4" />
              Go to my dashboard
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