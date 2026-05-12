# Base image
FROM node:20-slim

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

# Install ALL dependencies (including dev — needed for build)
RUN npm install

# Copy project files
COPY . .

# Build the Next.js app
RUN npm run build

# Copy standalone output to working dir
RUN cp -r .next/standalone/. . && \
    cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

# Set environment variables
ENV NODE_ENV=production
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
# Railway provides PORT automatically
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start using Next.js standalone server
CMD ["node", ".next/standalone/server.js"]

