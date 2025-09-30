#!/bin/bash

# Install LaunchAgent for auto-starting dev server on system boot
echo "📦 Installing Magi Dev Server as macOS LaunchAgent..."

# Copy plist file to LaunchAgents directory
cp com.magi.devserver.plist ~/Library/LaunchAgents/

# Load the LaunchAgent
launchctl load ~/Library/LaunchAgents/com.magi.devserver.plist

echo "✅ LaunchAgent installed!"
echo "🚀 Dev server will now start automatically on system boot"
echo ""
echo "To manage the service:"
echo "  Start:   launchctl start com.magi.devserver"
echo "  Stop:    launchctl stop com.magi.devserver"
echo "  Remove:  launchctl unload ~/Library/LaunchAgents/com.magi.devserver.plist"