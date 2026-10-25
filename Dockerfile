FROM node:20-slim

# Install system dependencies (Python3, ffmpeg, curl for yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Create non-root user (UID 1000) for Hugging Face Spaces compatibility
RUN useradd -m -u 1000 user
WORKDIR /home/user/app

# Copy package files and install dependencies
COPY --chown=user:user package*.json ./
RUN npm install --omit=dev

# Copy project files
COPY --chown=user:user . .

USER user

ENV NODE_ENV=production
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
ENV PORT=7860
ENV HOSTNAME=0.0.0.0

EXPOSE 7860
EXPOSE 3000

CMD ["node", "cloud-worker.js"]
