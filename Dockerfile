FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=2026

EXPOSE 2026

CMD ["node", "dist/main.js"]