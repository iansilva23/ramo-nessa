FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html styles.css guide.css admin-workspace.css favicon.svg /srv/admin/
COPY src /srv/admin/src
COPY pages /srv/admin/pages

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/administrodo/ || exit 1
