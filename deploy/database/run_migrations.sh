#!/usr/bin/env bash
# ==============================================================================
# SohojPharma Database Migration Runner
# Iterates through all supabase/migrations/*.sql in order and applies them.
# ==============================================================================

set -e

# Default connection settings
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-54322}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../supabase/migrations" && pwd)"

echo "==> Running SohojPharma migrations against ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}..."

if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "ERROR: Migrations directory not found at $MIGRATIONS_DIR"
    exit 1
fi

# Ensure migrations tracking table exists
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q << 'EOF'
CREATE TABLE IF NOT EXISTS public._schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
EOF

# Find and apply all .sql files in order
for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    filename=$(basename "$migration")
    
    # Check if already applied
    applied=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT COUNT(*) FROM public._schema_migrations WHERE version = '$filename';")
    
    if [ "$applied" -eq "0" ]; then
        echo "  Applying: $filename..."
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q -f "$migration"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q -c "INSERT INTO public._schema_migrations (version) VALUES ('$filename') ON CONFLICT DO NOTHING;"
    else
        echo "  Skipping (already applied): $filename"
    fi
done

echo "==> All migrations successfully verified and applied!"
