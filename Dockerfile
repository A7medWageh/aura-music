# Base image
FROM node:20-slim

# Cache bust — forces rebuild when this changes
ARG BUILD_DATE=2026-05-12-v3

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

# Copy standalone output to correct locations
RUN cp -r .next/standalone/. . && \
    cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

# Environment variables
ENV NODE_ENV=production
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["node", ".next/standalone/server.js"]
