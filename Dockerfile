# Align with package.json engines (Node 20+).
FROM node:22-alpine
RUN apk add --no-cache openssl wget

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

# Full install: `vite` and other build-time deps live in devDependencies.
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build && npx prisma generate

RUN npm prune --omit=dev && npm cache clean --force

CMD ["npm", "run", "docker-start"]
