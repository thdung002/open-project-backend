#!/bin/sh

# Add hosts entry
echo "172.16.0.11 proj.mecury.com.vn" >> /etc/hosts


# Start the application
exec nodemon server.js 