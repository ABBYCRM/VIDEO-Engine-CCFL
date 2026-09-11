FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fonts-dejavu-core fontconfig ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system nodejs && adduser --system --ingroup nodejs nextjs \
  && mkdir -p /app/data/videos /app/public/generated/compositions /ms-playwright \
  && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder /app/package.json ./package.json
# npx looks for a PATH binary that standalone images do not ship.
# Call the JS CLI directly so Chromium + OS deps install as root.
RUN node ./node_modules/playwright/cli.js install --with-deps chromium chrome \
  && chown -R nextjs:nodejs /ms-playwright /app/node_modules/playwright /app/node_modules/playwright-core
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
