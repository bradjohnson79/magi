#!/bin/bash

# Quick start script for Magi dev server
echo "🚀 Starting Magi Development Server..."
echo "📍 The server will run in the background permanently"
echo ""

# Start the server using PM2
cd /Users/bradjohnson/Documents/MAGI-online/magi-app
pm2 start ecosystem.config.js

echo ""
echo "✅ Server is running!"
echo "🌐 Open http://localhost:3000 in your browser"
echo ""
echo "📝 Useful commands:"
echo "  pm2 status         → Check server status"
echo "  pm2 logs magi-dev  → View logs"
echo "  pm2 stop magi-dev  → Stop server"
echo "  pm2 restart magi-dev → Restart server"
echo ""