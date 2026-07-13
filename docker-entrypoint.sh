#!/bin/sh
set -e

: "${PORT:=8080}"
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/sites-enabled/default

exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
