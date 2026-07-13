#!/bin/bash
# Run this after the Codespace finishes setting up: bash start.sh
# Starts the backend in the background and the frontend in the foreground.

cd "$(dirname "$0")"

echo "Starting backend on :4000..."
(cd backend && npm run dev > /tmp/backend.log 2>&1 &)

sleep 3
echo "Backend logs: tail -f /tmp/backend.log"
echo "Starting frontend on :5173 (this will run in the foreground)..."
cd frontend && npm run dev
