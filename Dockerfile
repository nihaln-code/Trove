FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor gettext-base \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

RUN sed -i '/user  *www-data;/d' /etc/nginx/nginx.conf \
    && sed -i 's#pid *.*/nginx.pid;#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app /var/log/nginx /var/lib/nginx /etc/nginx/sites-available/default

ENV PORT=8080

USER appuser

ENTRYPOINT ["/docker-entrypoint.sh"]
