# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Expose port if needed
EXPOSE 3000

# Use the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]