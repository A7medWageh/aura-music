# Base image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Build the Next.js app
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV PORT=7860

# Expose port
EXPOSE 7860

# Start command
CMD ["npm", "start"]
