FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# build tools let native modules (better-sqlite3, sharp) compile when no prebuilt binary
# matches the platform (e.g. Apple-silicon Macs -> linux/arm64); removed again after install
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && apt-get purge -y make g++ && apt-get autoremove -y \
 && rm -rf /root/.npm /var/lib/apt/lists/*
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p data .cache
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
