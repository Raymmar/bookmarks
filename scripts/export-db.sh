#!/bin/bash
# Database Export Script
# This script exports the database to a SQL file using pg_dump

# Check if DATABASE_URL environment variable is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Analyzing database connection string..."

# For Neon DB URLs like: postgresql://username:password@host/database?sslmode=require

# Extract host - everything between @ and / before the database name
HOST=$(echo $DATABASE_URL | grep -o '@.*/' | sed 's/@\(.*\)\/.*/\1/')
echo "Host: $HOST"

# Extract port (if present) - if not present, use default PostgreSQL port
if [[ $DATABASE_URL == *":@"* ]]; then
  PORT=$(echo $DATABASE_URL | grep -o ":[0-9]*/" | sed 's/[:/]//g')
else
  PORT="5432" # Default PostgreSQL port
fi
PORT_PARAM="-p $PORT"
echo "Port: $PORT"

# Extract username - everything between :// and : before password
USERNAME=$(echo $DATABASE_URL | grep -o "://.*:" | sed 's/:\/\/\(.*\):.*/\1/')
echo "Username: $USERNAME"

# Extract password - everything between username: and @host
PASSWORD=$(echo $DATABASE_URL | grep -o ":.*@" | sed 's/:\(.*\)@/\1/')
echo "Password: [REDACTED]"

# Extract database name - everything between host/ and ?params (if any)
DB_NAME=$(echo $DATABASE_URL | grep -o "/[^?]*" | sed 's/\///g' | sed 's/?.*//')
echo "Database: $DB_NAME"

# Create timestamp for filename
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUTPUT_FILE="database_export_$TIMESTAMP.sql"

echo "Exporting database $DB_NAME from host $HOST"
echo "Output will be saved to $OUTPUT_FILE"

# Export using pg_dump
export PGPASSWORD="$PASSWORD"
pg_dump -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -f "$OUTPUT_FILE" --no-owner --no-acl

# Check if export was successful
if [ $? -eq 0 ]; then
  FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
  echo "Export completed successfully."
  echo "File: $OUTPUT_FILE ($FILE_SIZE)"
  echo ""
  echo "Next steps:"
  echo "1. Download this file from Replit"
  echo "2. Upload it to your new Replit project"
  echo "3. Run the import script in the new project"
else
  echo "Export failed. See error messages above."
fi

# Reset password environment variable
unset PGPASSWORD