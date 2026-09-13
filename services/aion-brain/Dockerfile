FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data /app/reports \
 && chown -R node:node /app
USER node
ENV NODE_ENV=production \
    PORT=10000 \
    LLM_GATEWAY_DATA_DIR=/app/data \
    LLM_GATEWAY_REPORTS_DIR=/app/reports
EXPOSE 10000
CMD ["node", "server.js"]
