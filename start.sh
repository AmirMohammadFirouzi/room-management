#!/bin/bash
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Start Gunicorn in the background
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --timeout 120 &

# Start Nginx in the foreground (keeps the container running)
nginx -g "daemon off;"