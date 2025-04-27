import { MailService } from '@sendgrid/mail';
import { randomBytes } from 'crypto';
import { User } from '@shared/schema';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will not work.");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY || '');

// Email templates
const EMAIL_TEMPLATES = {
  verification: {
    subject: 'Verify your Atmosphere account',
    html: (username: string, token: string, baseUrl: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Atmosphere!</h2>
        <p>Hello ${username},</p>
        <p>Thank you for creating an account. To complete your registration, please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/verify-email?token=${token}" 
             style="background-color: #4F46E5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        <p>If you didn't create an account, you can safely ignore this email.</p>
        <p>Best regards,<br>The Atmosphere Team</p>
      </div>
    `
  },
  passwordReset: {
    subject: 'Reset your Atmosphere password',
    html: (username: string, token: string, baseUrl: string) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/reset-password?token=${token}" 
             style="background-color: #4F46E5; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>Best regards,<br>The Atmosphere Team</p>
      </div>
    `
  }
};

export class EmailService {
  private fromEmail: string;
  private baseUrl: string;

  constructor(fromEmail: string = 'raymmar@gmail.com', baseUrl: string = '') {
    this.fromEmail = fromEmail;
    // Default to the current domain if no baseUrl provided
    this.baseUrl = baseUrl || (process.env.PUBLIC_URL || 'https://atmospr.replit.app');
  }

  /**
   * Generate a random token for verification or password reset
   */
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Send an email verification to a user
   */
  async sendVerificationEmail(user: User, token: string): Promise<boolean> {
    const template = EMAIL_TEMPLATES.verification;
    
    try {
      await mailService.send({
        to: user.email,
        from: this.fromEmail,
        subject: template.subject,
        html: template.html(user.username, token, this.baseUrl),
      });
      return true;
    } catch (error) {
      console.error('Error sending verification email:', error);
      return false;
    }
  }

  /**
   * Send a password reset email to a user
   */
  async sendPasswordResetEmail(user: User, token: string): Promise<boolean> {
    const template = EMAIL_TEMPLATES.passwordReset;
    
    try {
      await mailService.send({
        to: user.email,
        from: this.fromEmail,
        subject: template.subject,
        html: template.html(user.username, token, this.baseUrl),
      });
      return true;
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }
}

// Export a singleton instance
export const emailService = new EmailService();