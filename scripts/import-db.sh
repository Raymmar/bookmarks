#!/bin/bash
# Database Import Script
# This script imports a SQL file into the database using psql

# Check if a filename was provided
if [ $# -eq 0 ]; then
  echo "ERROR: No SQL file specified"
  echo "Usage: $0 <sql_file>"
  exit 1
fi

# Get the SQL file path
SQL_FILE=$1

# Check if the file exists
if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: File not found: $SQL_FILE"
  exit 1
fi

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

echo "Importing $SQL_FILE into database $DB_NAME on host $HOST"

# Set the PGPASSWORD environment variable
export PGPASSWORD="$PASSWORD"

# First, check if there are existing tables and drop them if needed
echo "Checking existing database structure..."
TABLES=$(psql -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';")

if [ ! -z "$TABLES" ]; then
  echo "Found existing tables. Dropping them..."
  psql -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  echo "Dropped existing tables."
fi

# Now import the SQL file
echo "Starting database import..."
psql -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -f "$SQL_FILE"

# Check if import was successful
if [ $? -eq 0 ]; then
  echo "Import completed successfully."
  
  # Count number of tables imported
  TABLE_COUNT=$(psql -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';")
  echo "Imported $TABLE_COUNT tables."
  
  # Show top 5 tables by row count
  echo "Top tables by row count:"
  psql -h "$HOST" $PORT_PARAM -U "$USERNAME" -d "$DB_NAME" -c "
    SELECT
      table_name,
      (SELECT COUNT(*) FROM information_schema.tables) AS row_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    LIMIT 5;
  "
else
  echo "Import failed. See error messages above."
fi

# Reset the PGPASSWORD environment variable
unset PGPASSWORD