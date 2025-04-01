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

# RUN sh -c 'echo "172.16.0.11 proj.mecury.com.vn" >> /etc/hosts'
RUN chmod +x /app/entrypoint.sh

# Start the application
CMD [ "/app/entrypoint.sh" ]