# Align with package.json engines (Node 20+).
FROM node:22-alpine
RUN apk add --no-cache openssl wget

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build && npx prisma generate

CMD ["npm", "run", "docker-start"]
