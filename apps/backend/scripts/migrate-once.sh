#!/bin/sh

echo "🚀 One-time Migration Script"
echo "============================"

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until nc -z postgres 5432; do
  echo "   Database not ready, waiting 2 seconds..."
  sleep 2
done
echo "✅ Database is ready!"

# Check if migrations have already been run
echo "🔍 Checking if migrations are needed..."

# Simple check - look for the new 'issues' table
MIGRATION_NEEDED=$(psql $DATABASE_URL -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='issues';")

if [ "$MIGRATION_NEEDED" = "0" ]; then
  echo "📊 Running database migrations..."
  bun run db:migrate
  
  if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully!"
    # Create a marker file to indicate migrations are done
    touch /tmp/migrations-completed
  else
    echo "❌ Migration failed! Exiting..."
    exit 1
  fi
else
  echo "✅ Migrations already completed, skipping..."
  touch /tmp/migrations-completed
fi

# Start the server
echo "🎯 Starting backend server..."
exec node dist/index.js
