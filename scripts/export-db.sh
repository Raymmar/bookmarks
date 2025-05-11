#!/bin/bash
# Database Export Script
# This script exports the database to a SQL file using pg_dump

# Check if DATABASE_URL environment variable is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Parse DATABASE_URL to extract connection details
# Example URL: postgres://username:password@host:port/database
# Extract host (remove any leading/trailing slashes)
HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')

# Extract port (if present)
PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
PORT_PARAM=""
if [ ! -z "$PORT" ]; then
  PORT_PARAM="-p $PORT"
fi

# Extract username
USERNAME=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')

# Extract password
PASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\).*/\1/p')

# Extract database name
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\).*/\1/p')

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