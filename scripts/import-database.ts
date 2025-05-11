/**
 * Database Import Script
 * 
 * This script imports a SQL dump file into the database.
 * It uses psql to restore a complete backup into a new database instance.
 * 
 * Usage:
 * 1. Make sure you've uploaded the SQL dump file to this project
 * 2. Run: npx tsx scripts/import-database.ts <path-to-dump-file>
 * 3. The dump file will be imported into the database specified by DATABASE_URL
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

async function importDatabase(dumpFilePath: string) {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Check if the dump file exists
    if (!fs.existsSync(dumpFilePath)) {
      throw new Error(`Dump file not found: ${dumpFilePath}`);
    }

    // Parse the DATABASE_URL to extract connection details
    const dbUrl = new URL(process.env.DATABASE_URL);
    const host = dbUrl.hostname;
    const port = dbUrl.port;
    const database = dbUrl.pathname.substring(1); // Remove leading '/'
    const username = dbUrl.username;
    const password = dbUrl.password;

    console.log(`Importing database dump to: ${database} on host: ${host}`);
    
    // Set up environment variables for psql
    const env = {
      ...process.env,
      PGPASSWORD: password
    };

    // First, we need to check if there are existing tables and drop them if needed
    console.log('Checking existing database structure...');
    
    // Get list of all tables in the database
    const listTablesCommand = `psql -h ${host} -p ${port} -U ${username} -d ${database} -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"`;
    const { stdout: tablesList } = await execAsync(listTablesCommand, { env });
    
    if (tablesList.trim()) {
      console.log('Found existing tables. Preparing to drop them...');
      
      // Drop all existing tables if they exist
      const dropTablesCommand = `psql -h ${host} -p ${port} -U ${username} -d ${database} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
      await execAsync(dropTablesCommand, { env });
      console.log('Dropped existing tables.');
    }

    // Now import the database dump
    console.log('Starting database import...');
    const psqlCommand = `psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${dumpFilePath}"`;
    
    const { stdout, stderr } = await execAsync(psqlCommand, { env });
    
    if (stderr && !stderr.includes('PostgreSQL database restore complete')) {
      console.warn('Warning during import:', stderr);
    }
    
    console.log('Database import completed successfully.');
    
    return 'Database import completed successfully';
  } catch (error) {
    console.error('Database import failed:', error);
    throw error;
  }
}

// Get the dump file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide the path to the dump file as an argument');
  console.error('Usage: npx tsx scripts/import-database.ts <path-to-dump-file>');
  process.exit(1);
}

const dumpFilePath = args[0];

// Run the import function
importDatabase(dumpFilePath)
  .then((message) => {
    console.log(message);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during database import:', error);
    process.exit(1);
  });