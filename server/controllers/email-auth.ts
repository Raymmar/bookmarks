import { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { emailService } from "../services/email";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
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
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Invalid verification token" });
      }
      
      // Verify the token
      const user = await storage.verifyEmail(token);
      
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }
      
      // For security, require users to login manually after email verification
      // instead of auto-logging them in
      const { password, ...userWithoutPassword } = user;
      res.status(200).json({ 
        message: "Email verified successfully. Please log in to continue.", 
        verified: true 
      });
    } catch (error) {
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