/**
 * Migration Script for Email Verification Fields
 * 
 * This script adds the necessary columns to the users table for email verification and password reset:
 * - email_verified: Boolean flag indicating if the user's email is verified
 * - verification_token: Token for email verification
 * - verification_expires: Expiration timestamp for the verification token
 * - reset_token: Token for password reset
 * - reset_expires: Expiration timestamp for the reset token
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function addEmailVerificationFields() {
  console.log("Adding email verification fields to users table...");

  try {
    // Check if email_verified column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'email_verified';
    `);

    if (checkResult.rows.length > 0) {
      console.log("email_verified column already exists, skipping migration.");
      return;
    }

    // Add email verification columns to the users table
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token TEXT,
      ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reset_token TEXT,
      ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP;
    `);

    console.log("Successfully added email verification fields to users table");
  } catch (error) {
    console.error("Error adding email verification fields:", error);
    throw error;
  }
}

// Run the migration
addEmailVerificationFields()
  .then(() => {
    console.log("Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });