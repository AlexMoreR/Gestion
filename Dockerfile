FROM node:20-alpine AS deps
WORKDIR /app
# puppeteer's bundled Chromium is a glibc build and won't run on alpine (musl);
# we use the system chromium in the runner instead, so skip the download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Zona horaria de Colombia para que las fechas y el agrupamiento por mes
# coincidan con la operacion (sin esto el server corre en UTC y las fechas se
# corren un dia / al mes siguiente en la noche).
ENV TZ=America/Bogota

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont tzdata
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
