import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Redirect, useLocation } from "wouter";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle } from "lucide-react";
import { apiRequest } from "../lib/queryClient";

const AuthPage = () => {
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("login");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [location] = useLocation();

  // Handle verification success message from redirect
  useEffect(() => {
    // Check if there's state from navigation (like from email verification)
    const state = window.history.state?.state;
    if (state?.message && state?.type === "success") {
      setVerificationSuccess(true);
      setVerificationMessage(state.message);
      setActiveTab("login");
      
      // Clear the state so it doesn't show again on refresh
      window.history.replaceState({}, document.title, location);
    }
  }, [location]);

  // Redirect to home if user is already logged in
  if (user) {
    return <Redirect to="/" />;
  }

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    if (!username || !password) {
      toast({
        title: "Error",
        description: "Please enter both username and password",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate({ username, password });
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const email = formData.get("email") as string;

    if (!username || !password || !email) {
      toast({
        title: "Error",
        description: "Please enter username, password, and email",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate({ username, password, email }, {
      onSuccess: () => {
        setRegistrationSuccess(true);
        setActiveTab("login"); // Switch to login tab after successful registration
      }
    });
  };

  // Function to send verification email
  const handleSendVerificationEmail = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to request email verification",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await apiRequest("POST", "/api/email/send-verification");
      
      if (response.ok) {
        setVerificationEmailSent(true);
        toast({
          title: "Success",
          description: "Verification email sent successfully!",
        });
      } else {
        const errorData = await response.json();
        toast({
          title: "Error",
          description: errorData.message || "Failed to send verification email",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error sending verification email:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while sending verification email",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side: Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {showForgotPassword ? (
            <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
          ) : (
            <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>
                      Sign in to access your bookmarks and collections.
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleLogin}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input id="username" name="username" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" name="password" type="password" required />
                      </div>
                      <div className="text-right">
                        <Button 
                          variant="link" 
                          type="button" 
                          className="p-0 h-auto font-normal text-sm text-muted-foreground"
                          onClick={() => setShowForgotPassword(true)}
                        >
                          Forgot password?
                        </Button>
                      </div>
                    </CardContent>
                    <CardFooter className="flex flex-col space-y-2">
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={loginMutation.isPending}
                      >
                        {loginMutation.isPending ? "Signing in..." : "Sign in"}
                      </Button>
                      
                      {verificationEmailSent && (
                        <Alert className="bg-primary/10 border-primary">
                          <CheckCircle className="h-4 w-4 text-primary" />
                          <AlertDescription>
                            Verification email sent! Please check your inbox.
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {registrationSuccess && (
                        <Alert className="bg-primary/10 border-primary">
                          <CheckCircle className="h-4 w-4 text-primary" />
                          <AlertDescription>
                            Registration successful! Please check your email to verify your account before logging in.
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {verificationSuccess && (
                        <Alert className="bg-primary/10 border-primary">
                          <CheckCircle className="h-4 w-4 text-primary" />
                          <AlertDescription>
                            {verificationMessage || "Your email has been verified successfully! You can now log in."}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>
              <TabsContent value="register">
                <Card>
                  <CardHeader>
                    <CardTitle>Create account</CardTitle>
                    <CardDescription>
                      Register to start organizing your bookmarks.
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleRegister}>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-username">Username</Label>
                        <Input id="new-username" name="username" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" name="email" type="email" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">Password</Label>
                        <Input id="new-password" name="password" type="password" required />
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={registerMutation.isPending}
                      >
                        {registerMutation.isPending ? "Creating account..." : "Create account"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Right side: Hero section */}
      <div className="hidden md:flex flex-1 bg-gradient-to-br from-primary/30 to-secondary/50 flex-col items-center justify-center p-12 text-left">
        <div className="max-w-md space-y-6">
          <h1 className="text-6xl font-bold"> Turn your doom scrolling into deep insights</h1>
          <p className="text-xl">
            Atmosphere is an AI powered bookmark manager designed to extract key insights from the obscure nuggets you find while scrolling online.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;