# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- run (standalone) ----
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# create non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# standalone output contains a minimal server + required node_modules subset
COPY --from=build /app/.next/standalone ./
# static assets must be served too
COPY --from=build /app/.next/static ./.next/static
# if you use /public assets, keep them

USER nextjs
EXPOSE 3000
CMD ["node","server.js"]
