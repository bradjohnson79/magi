#!/bin/bash

# Magi Local Dev Server Manager
# This script manages the always-on development server

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_DIR="/Users/bradjohnson/Documents/MAGI-online/magi-app"
APP_NAME="magi-dev"

# Function to start the dev server
start_server() {
    echo -e "${GREEN}Starting Magi dev server...${NC}"
    cd $PROJECT_DIR

    # Check if already running
    if pm2 status | grep -q $APP_NAME; then
        echo -e "${YELLOW}Server is already running!${NC}"
        pm2 status $APP_NAME
    else
        pm2 start ecosystem.config.js
        echo -e "${GREEN}✓ Dev server started successfully!${NC}"
        echo -e "${GREEN}Access your app at: http://localhost:3000${NC}"
    fi
}

# Function to stop the dev server
stop_server() {
    echo -e "${YELLOW}Stopping Magi dev server...${NC}"
    pm2 stop $APP_NAME
    echo -e "${GREEN}✓ Server stopped${NC}"
}

# Function to restart the dev server
restart_server() {
    echo -e "${YELLOW}Restarting Magi dev server...${NC}"
    pm2 restart $APP_NAME
    echo -e "${GREEN}✓ Server restarted${NC}"
}

# Function to check server status
status_server() {
    echo -e "${GREEN}Magi dev server status:${NC}"
    pm2 status $APP_NAME
}

# Function to view logs
view_logs() {
    echo -e "${GREEN}Viewing server logs (Ctrl+C to exit):${NC}"
    pm2 logs $APP_NAME
}

# Function to enable auto-startup on system boot
enable_startup() {
    echo -e "${GREEN}Enabling auto-startup on system boot...${NC}"
    pm2 startup
    pm2 save
    echo -e "${GREEN}✓ Auto-startup enabled${NC}"
}

# Function to disable auto-startup
disable_startup() {
    echo -e "${YELLOW}Disabling auto-startup...${NC}"
    pm2 unstartup
    echo -e "${GREEN}✓ Auto-startup disabled${NC}"
}

# Main menu
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        status_server
        ;;
    logs)
        view_logs
        ;;
    enable-startup)
        enable_startup
        ;;
    disable-startup)
        disable_startup
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|enable-startup|disable-startup}"
        echo ""
        echo "Commands:"
        echo "  start           - Start the dev server"
        echo "  stop            - Stop the dev server"
        echo "  restart         - Restart the dev server"
        echo "  status          - Check server status"
        echo "  logs            - View server logs"
        echo "  enable-startup  - Auto-start on system boot"
        echo "  disable-startup - Disable auto-start"
        exit 1
        ;;
esac