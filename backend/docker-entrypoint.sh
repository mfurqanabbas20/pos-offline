#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput >/dev/null

if [ "${SEED_DATA:-false}" = "true" ]; then
  python manage.py seed_data
fi

exec "$@"
