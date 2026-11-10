# FORJA — imagem única: API + site (o mesmo endereço serve o app do PC e o do celular).
#
# Dois jeitos de montar a imagem:
#   • completo (padrão):  docker compose up -d --build
#     compila o site e a API aqui dentro — precisa de ~2 GB de RAM (ou 1 GB + swap).
#   • release:            npm run deploy   (no seu PC)
#     o PC compila e envia só o resultado; o servidor monta o alvo "release", que apenas
#     instala as dependências de execução. Ideal para VPS pequena (ver docs/HOSPEDAGEM.md).

# ---------- base de execução (comum aos dois jeitos) ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3333 \
    DATA_DIR=/data \
    WEB_DIST=/srv/forja/web
WORKDIR /srv/forja
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
RUN npm ci --omit=dev --workspace=@forja/api --no-audit --no-fund && npm cache clean --force
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]

# ---------- release: arquivos já compilados no PC (npm run deploy) ----------
FROM runtime AS release
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/data apps/api/data
COPY apps/api/dist apps/api/dist
COPY web web
USER node

# ---------- compila o site (Expo web) e a API ----------
FROM node:22-bookworm-slim AS build
WORKDIR /src
ENV CI=1 EXPO_NO_TELEMETRY=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:web -w @forja/app && npm run build -w @forja/api

# ---------- completo (padrão — precisa ser o último estágio) ----------
FROM runtime AS run
COPY --from=build /src/apps/api/drizzle apps/api/drizzle
COPY --from=build /src/apps/api/data apps/api/data
COPY --from=build /src/apps/api/dist apps/api/dist
COPY --from=build /src/apps/app/dist web
USER node
