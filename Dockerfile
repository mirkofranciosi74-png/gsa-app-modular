FROM node:18-alpine

# GraphicsMagick + Ghostscript per OCR su PDF scansionati
RUN apk add --no-cache graphicsmagick ghostscript postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
