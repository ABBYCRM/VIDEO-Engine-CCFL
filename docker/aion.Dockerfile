FROM node:22-alpine
RUN apk add --no-cache git python3 make g++
WORKDIR /app
# Pin the reviewed API contract; upgrades are explicit.
RUN git init . \
 && git remote add origin https://github.com/ABBYCRM/Aion-Brain.git \
 && git fetch --depth 1 origin 951947b04395037e0063bcbf14183187ef1a42a8 \
 && git checkout --detach FETCH_HEAD \
 && npm ci --omit=dev \
 && rm -rf .git \
 && mkdir -p /app/data /app/reports \
 && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=10000 LLM_GATEWAY_DATA_DIR=/app/data LLM_GATEWAY_REPORTS_DIR=/app/reports
CMD ["node", "server.js"]
