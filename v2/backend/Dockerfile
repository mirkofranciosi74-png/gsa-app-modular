FROM node:20-alpine

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache graphicsmagick ghostscript postgresql-client

WORKDIR /app

COPY v2/backend/package*.json ./
RUN npm ci --omit=dev

COPY v2/backend/ ./
COPY ita.traineddata ./

EXPOSE 3002
CMD ["node", "server.js"]
