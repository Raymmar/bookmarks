/**
 * Database Export Script
 * 
 * This script exports the entire database to a SQL dump file.
 * It uses pg_dump to create a complete backup of the database that
 * can be imported into a new database instance.
 * 
 * Usage:
 * 1. Run: npx tsx scripts/export-database.ts
 * 2. The dump file will be created as `database-export.sql` in the 
 *    root directory of the project
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

async function exportDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse the DATABASE_URL to extract connection details
    const dbUrl = new URL(process.env.DATABASE_URL);
    const host = dbUrl.hostname;
    const port = dbUrl.port;
    const database = dbUrl.pathname.substring(1); // Remove leading '/'
    const username = dbUrl.username;
    const password = dbUrl.password;

    console.log(`Exporting database: ${database} from host: ${host}`);
    
    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFilename = `database-export-${timestamp}.sql`;
    const outputPath = path.join(process.cwd(), outputFilename);
    
    // Set up environment variables for pg_dump
    const env = {
      ...process.env,
      PGPASSWORD: password
    };

    // Prepare pg_dump command
    // Check if port is empty and handle it appropriately
    const portParam = port ? `-p ${port}` : '';
    
    // Handle special characters in the username and database name
    const pgDumpCommand = `pg_dump -h "${host}" ${portParam} -U "${username}" -d "${database}" -f "${outputPath}" --no-owner --no-acl`;
    
    console.log('Starting database export...');
    console.log(`Using command: ${pgDumpCommand}`);
    
    // Execute pg_dump
    const { stdout, stderr } = await execAsync(pgDumpCommand, { env });
    
    if (stderr && !stderr.includes('PostgreSQL database dump complete')) {
      console.warn('Warning during export:', stderr);
    }
    
    // Check if the file was created successfully
    const stats = fs.statSync(outputPath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    
    console.log(`Database export completed successfully.`);
    console.log(`Output file: ${outputPath} (${fileSizeInMB.toFixed(2)} MB)`);
    
    // Provide instructions for the next steps
    console.log('\nNext steps:');
    console.log('1. Copy the export file to the new Replit project');
    console.log('2. In the new project, create a script to import the data');
    console.log('3. Run the import script to restore the data to the new database');
    
    return outputPath;
  } catch (error) {
    console.error('Database export failed:', error);
    throw error;
  }
}

// Run the export function
exportDatabase()
  .then((outputPath) => {
    console.log(`Database exported to: ${outputPath}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during database export:', error);
    process.exit(1);
  });