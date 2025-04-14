#!/bin/sh

# Add hosts entry
echo "172.16.0.11 proj.mecury.com.vn" >> /etc/hosts

# Install dependencies
echo "Installing dependencies..."
npm install

# Start the application
exec nodemon server.js 