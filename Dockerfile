# syntax=docker/dockerfile:1
#
# TaskFlow production image: Apache + PHP 8.3, with the scheduler running alongside the web
# server (see docker/supervisord.conf).
#
# The scheduler lives in this container on purpose. On Render a persistent disk attaches to a
# single service and cron jobs cannot read it, so a separate cron service could not reach the
# SQLite database. Running `schedule:work` here keeps the 08:00 briefing next to its data.

# ---------- assets ----------
FROM node:20-alpine AS assets
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY resources ./resources
RUN npm run build

# ---------- application ----------
FROM php:8.3-apache

# pdo_sqlite ships with the base image; pdo_mysql and pdo_pgsql are here so the database can be
# switched with env vars alone if this ever outgrows SQLite.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git unzip libzip-dev libpq-dev supervisor \
    && docker-php-ext-install -j"$(nproc)" pdo_mysql pdo_pgsql zip opcache \
    && a2enmod rewrite headers \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/php.ini /usr/local/etc/php/conf.d/taskflow.ini
COPY docker/supervisord.conf /etc/supervisor/conf.d/taskflow.conf

WORKDIR /var/www/html

# Dependencies first so code changes don't invalidate the composer layer.
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
COPY --from=assets /app/public/build ./public/build

RUN composer dump-autoload --optimize --no-dev --classmap-authoritative \
    && chown -R www-data:www-data /var/www/html \
    && chmod +x docker/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["docker/entrypoint.sh"]
