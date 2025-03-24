# Use Node.js LTS version
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

RUN npm install -g nodemon

# Copy application files
COPY . .

# Add hosts entry
RUN sh -c 'echo "172.16.0.11 proj.mecury.com.vn" >> /etc/hosts'

# Expose port if needed
EXPOSE 3000

# Start the application
CMD [ "nodemon", "server.js" ]