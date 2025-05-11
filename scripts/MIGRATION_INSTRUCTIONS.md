# Database Migration Instructions

This document explains how to migrate your database from one Neon PostgreSQL instance to another. We've provided multiple approaches to accommodate various scenarios.

## Option 1: PostgreSQL Dump and Restore using Bash Scripts (Recommended)

This approach uses PostgreSQL's built-in `pg_dump` and `psql` tools with simple bash scripts.

### Step 1: Export the database

In your source Replit project, run:

```bash
./scripts/export-db.sh
```

This will create a SQL dump file in your project's root directory (e.g., `database_export_2025-05-11_22-45-30.sql`).

### Step 2: Transfer the SQL file to the new project

You can download the SQL file from your source Replit project and upload it to the target Replit project.

### Step 3: Import the database

In your target Replit project, run:

```bash
./scripts/import-db.sh <sql-file-name>
```

Replace `<sql-file-name>` with the path to the SQL dump file you uploaded.

## Option 2: PostgreSQL Dump and Restore using TypeScript

This approach also uses PostgreSQL's tools but wrapped in TypeScript for more detailed error handling.

### Step 1: Export the database

In your source Replit project, run:

```bash
npx tsx scripts/export-database.ts
```

This will create a SQL dump file in your project's root directory.

### Step 2: Transfer the SQL file to the new project

You can download the SQL file from your source Replit project and upload it to the target Replit project.

### Step 3: Import the database

In your target Replit project, run:

```bash
npx tsx scripts/import-database.ts <path-to-dump-file>
```

Replace `<path-to-dump-file>` with the path to the SQL dump file you uploaded.

## Option 2: Programmatic Migration

If the PostgreSQL dump/restore approach doesn't work for any reason, you can use the programmatic migration script.

### Prerequisites

You'll need to set two environment variables:

1. `SOURCE_DATABASE_URL` - The connection string for your source database
2. `TARGET_DATABASE_URL` - The connection string for your target database

### Run the migration

```bash
npx tsx scripts/migrate-data.ts
```

This script will:
- Connect to both source and target databases
- Copy data table by table in the correct order to maintain foreign key relationships
- Log progress and report any issues

## Troubleshooting

### Common Issues with pg_dump

1. **Permission denied**: Ensure the database user has appropriate permissions
2. **Command not found**: Make sure pg_dump is installed on the Replit instance
3. **Large data sets**: For very large databases, consider running the migration during off-peak hours

### Common Issues with Programmatic Migration

1. **Memory limits**: The script processes data in batches to avoid memory issues, but very large tables might still cause problems
2. **Missing foreign keys**: If you encounter foreign key constraint errors, check that tables are being migrated in the correct order

## Verification Steps

After completing the migration, verify that:

1. All tables were successfully created in the target database
2. The row counts match between source and target databases
3. Application functionality works as expected with the new database

If you encounter any issues, you can check the database logs or run specific queries to identify and resolve data inconsistencies.