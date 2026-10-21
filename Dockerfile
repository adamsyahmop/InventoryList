# syntax=docker/dockerfile:1

# Aplikasi ini memakai SQLite lewat `better-sqlite3` (modul native) dan menyimpan
# foto barang di disk, jadi TIDAK bisa dijalankan di platform serverless
# (Vercel/Netlify): filesystem-nya read-only/ephemeral. Sasaran deploy: VPS atau
# mesin apa pun yang punya Docker, dengan dua volume tetap (database + uploads).

# ---------------------------------------------------------------- deps --------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 mengunduh prebuilt binary; kalau tidak tersedia untuk platform
# ini, npm akan membangunnya dari source dan butuh toolchain berikut.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ------------------------------------------------------------- builder --------
FROM deps AS builder
WORKDIR /app
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Client Prisma digenerate ke `src/generated/prisma` (lihat schema.prisma), jadi
# harus dibuat SEBELUM build — folder itu tidak ikut repo.
RUN npx prisma generate && npm run build

# -------------------------------------------------------------- runner --------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# `output: "standalone"` sudah membawa node_modules yang benar-benar dipakai.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Foto barang ditulis ke `uploads/items` (di luar `public/`), database ke /data.
# Keduanya volume — kalau tidak, semuanya hilang saat container dibuat ulang.
RUN mkdir -p /app/uploads/items /data && chown -R node:node /app/uploads /data

USER node
EXPOSE 3000

# `server.js` adalah entrypoint hasil build standalone (bukan `next start`).
CMD ["node", "server.js"]
