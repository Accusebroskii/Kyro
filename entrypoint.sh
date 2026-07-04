#!/bin/sh
set -e

echo "Fetching latest yt-dlp..."
if curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp; then
  chmod a+rx /usr/local/bin/yt-dlp
  echo "yt-dlp updated: $(/usr/local/bin/yt-dlp --version)"
else
  echo "WARNING: failed to fetch latest yt-dlp, falling back to existing binary"
fi

exec "$@"
