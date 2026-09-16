#!/usr/bin/env bash
set -euo pipefail

# Everything that must survive a redeploy lives on the mounted disk: the SQLite database and
# uploaded attachments. Compiled views and caches stay in the container — they are rebuilt below.
DATA_DIR="${DATA_DIR:-/var/data}"
DB_FILE="${DB_DATABASE:-$DATA_DIR/database.sqlite}"

mkdir -p "$DATA_DIR" "${LOCAL_DISK_ROOT:-$DATA_DIR/attachments}"
mkdir -p storage/framework/{cache/data,sessions,views} storage/logs bootstrap/cache

if [ "${DB_CONNECTION:-sqlite}" = "sqlite" ] && [ ! -f "$DB_FILE" ]; then
    echo "Creating database at $DB_FILE"
    touch "$DB_FILE"
fi

chown -R www-data:www-data "$DATA_DIR" storage bootstrap/cache

php artisan migrate --force --no-interaction

# Seeding is idempotent: it creates or updates the administrator from the ADMIN_* variables.
if [ -n "${ADMIN_EMAIL:-}" ]; then
    php artisan db:seed --force --no-interaction || echo "Seeder skipped (already applied)"
fi

php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "TaskFlow ready — scheduler and web server starting."
exec supervisord -c /etc/supervisor/conf.d/taskflow.conf
