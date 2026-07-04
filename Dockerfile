FROM node:22.21.1-slim AS base
WORKDIR /app
RUN npm install -g pnpm@10.26.1

FROM base AS build
RUN apt-get update -qq && apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg python3 ca-certificates curl && \
    curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/artifacts/api-server
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
