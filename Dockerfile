# syntax=docker/dockerfile:1

# ---- 1. build the React app ----------------------------------------------------------
FROM node:22-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client ./
RUN npm run build

# ---- 2. install production server deps (better-sqlite3 ships prebuilt binaries; the toolchain is a fallback) ----
FROM node:22-slim AS server-deps
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- 3. small runtime image ---------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/leadflow.db
WORKDIR /app
COPY server ./server
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
