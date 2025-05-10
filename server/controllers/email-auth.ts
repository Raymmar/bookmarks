import { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { emailService } from "../services/email";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Password hashing function
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// Constants
const VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour in milliseconds

export function setupEmailAuthRoutes(app: Express) {
  // Send email verification email
  app.post("/api/email/send-verification", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to request email verification" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.email_verified) {
        return res.status(400).json({ message: "Email is already verified" });
      }

      // Generate verification token
      const token = emailService.generateToken();
      
      // Set verification token in the database
      const success = await storage.setVerificationToken(user.id, token, VERIFICATION_TOKEN_EXPIRY);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to generate verification token" });
      }
      
      // Send verification email
      const emailSent = await emailService.sendVerificationEmail(user, token);
      
      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }
      
      res.status(200).json({ message: "Verification email sent successfully" });
    } catch (error) {
      next(error);
    }
  });

  // Verify email with token
  app.get("/api/email/verify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.query;
      
      console.log("Email verification request received with token:", token);
      
      if (!token || typeof token !== "string") {
        console.log("Token missing or invalid format");
        return res.status(400).json({ message: "Invalid verification token" });
      }
      
      // First check if this token exists and belongs to a user
      const userByToken = await storage.getUserByVerificationToken(token);
      console.log("User lookup by token result:", userByToken ? `Found user: ${userByToken.email}` : "No user found");
      
      // If no user found with this token, it might have already been used or is invalid
      if (!userByToken) {
        // Check if there's a verified user with a matching token hash (could be a reused token)
        // This would require additional functionality, but as a workaround we'll just return a clear message
        console.log("No user found with this verification token - might be already used or invalid");
        return res.status(400).json({ 
          message: "Invalid or expired verification token. If you've already verified your email, please log in.",
          alreadyVerified: true
        });
      }
      
      // If the user is already verified, log them in but provide a different message
      if (userByToken.email_verified) {
        console.log("User's email is already verified:", userByToken.email);
        
        // Log the already-verified user in
        return req.login(userByToken, (err) => {
          if (err) {
            console.error("Error logging in already-verified user:", err);
            return next(err);
          }
          
          console.log("Already-verified user successfully logged in");
          
          // Return success with an appropriate message
          const { password, ...userWithoutPassword } = userByToken;
          return res.status(200).json({ 
            message: "Your email was already verified. You have been logged in.", 
            verified: true,
            alreadyVerified: true,
            user: userWithoutPassword
          });
        });
      }
      
      // Now proceed to actually verify the email
      console.log("Attempting to verify email with token:", token);
      const user = await storage.verifyEmail(token);
      
      if (!user) {
        console.log("Failed to verify email - database update error");
        return res.status(500).json({ message: "Failed to verify your email due to a server error" });
      }
      
      console.log("User successfully verified:", user.id, user.email);
      
      // Automatically log in the user after verification
      req.login(user, (err) => {
        if (err) {
          console.error("Error logging in user after verification:", err);
          return next(err);
        }
        
        console.log("User successfully logged in after verification");
        
        // Return success and the user data without password
        const { password, ...userWithoutPassword } = user;
        res.status(200).json({ 
          message: "Email verified successfully. You are now logged in.", 
          verified: true,
          user: userWithoutPassword
        });
      });
    } catch (error) {
      console.error("Unexpected error during email verification:", error);
      next(error);
    }
  });

  // Request password reset
  app.post("/api/password/forgot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      
      // Don't reveal if the user exists or not for security reasons
      if (!user) {
        return res.status(200).json({ message: "If your email is registered, you will receive a password reset link" });
      }
      
      // Generate reset token
      const token = emailService.generateToken();
      
      // Set reset token in the database
      const success = await storage.setResetToken(user.id, token, RESET_TOKEN_EXPIRY);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to generate reset token" });
      }
      
      // Send password reset email
      const emailSent = await emailService.sendPasswordResetEmail(user, token);
      
      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send password reset email" });
      }
      
      res.status(200).json({ message: "If your email is registered, you will receive a password reset link" });
    } catch (error) {
      next(error);
    }
  });

  // Reset password with token
  app.post("/api/password/reset", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      
      // Hash the new password
      const hashedPassword = await hashPassword(password);
      
      // Reset the password
      const success = await storage.resetPassword(token, hashedPassword);
      
      if (!success) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }
      
      res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
      next(error);
    }
  });
}