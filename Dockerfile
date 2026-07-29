FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# migrate.ts resolves its migrations folder relative to its own compiled
# location (dist/db/migrate.js -> dist/db/migrations), not src/ — this has
# to land next to the compiled file, not the TypeScript source.
COPY --from=build /app/src/db/migrations ./dist/db/migrations
COPY --from=build /app/public ./public
EXPOSE 4000
CMD ["node", "dist/index.js"]
