FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && rm -rf /root/.npm
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p data .cache
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
