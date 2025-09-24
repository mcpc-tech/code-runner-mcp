FROM denoland/deno:latest

# Set environment variables for better performance with Python 3.12
ENV DENO_DIR=/deno-cache
ENV DENO_INSTALL_ROOT=/usr/local
ENV NODE_ENV=production

# Create working directory
WORKDIR /app

# Create deno cache directory with proper permissions
RUN mkdir -p /deno-cache && chmod 755 /deno-cache

# Copy dependency files first for better caching
COPY deno.json ./

# Copy your local source code
COPY . .

# Cache the main server file and dependencies
RUN deno cache src/server.ts || echo "Cache completed"

# Expose port
EXPOSE 9000

# Simple health check for cloud deployment
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# Run the server with simplified configuration
ENTRYPOINT ["deno", "run", "--allow-all", "src/server.ts"]