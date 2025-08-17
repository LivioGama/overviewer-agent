#!/bin/sh

echo "🚀 Starting Ollama Turbo Agent Backend..."
echo "========================================"

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until nc -z postgres 5432; do
  echo "   Database not ready, waiting 2 seconds..."
  sleep 2
done
echo "✅ Database is ready!"

# Run database migrations
echo "📊 Running database migrations..."
bun run db:migrate

if [ $? -eq 0 ]; then
  echo "✅ Migrations completed successfully!"
else
  echo "❌ Migration failed! Exiting..."
  exit 1
fi

# Start the server
echo "🎯 Starting backend server..."
exec node dist/index.js
