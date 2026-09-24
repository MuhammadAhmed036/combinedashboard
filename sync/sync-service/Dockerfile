# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm install --omit=dev

COPY index.js ./

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m -s /bin/sh nodeuser
USER nodeuser

CMD ["node", "index.js"]
