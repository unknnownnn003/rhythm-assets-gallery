# Security Hardening Notes

This repo can harden the frontend and the local stats/APK runtime service, but the production Nginx headers and rate limits are still controlled outside the repo by Baota.

## Stats Server Runtime Env

`scripts/stats-server.mjs` now requires these runtime variables:

```text
STATS_SALT=<long-random-secret>
STATS_ALLOWED_ORIGINS=https://www.unknnownnn.homes,http://localhost:4321
```

Optional:

```text
STATS_TRACK_COOLDOWN_MS=15000
```

Behavior:

- `/api/stats?track=1` is used by the homepage stats panel and records the current page view before returning fresh totals.
- Cross-site tracking requests are rejected instead of incrementing counters.
- Repeated track hits from the same hashed visitor inside the cooldown window do not increment views again.
- CORS is no longer `*`; it is only returned for allowed origins.

## Recommended Nginx Proxy and Rate Limit

Define a shared limit zone once in the server or http block:

```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/m;
```

Then proxy `/api/` to the local service with a tighter rule for stats. Point it at the IPv4 loopback host so Nginx and the Node listener cannot drift onto different localhost families:

```nginx
location /api/stats {
    limit_req zone=api_limit burst=10 nodelay;
    proxy_pass http://<ipv4-loopback>:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://<ipv4-loopback>:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Recommended Security Headers

These should be added at the Nginx layer for the static site and the proxied API:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

## CSP

The remaining handwritten inline scripts were removed from the homepage and asset detail page, but Astro still emits small inline hydration/runtime snippets. Until the site moves to nonces or hashes, the practical policy still needs inline scripts enabled.

Recommended header:

```nginx
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
```

The Astro pages also ship the same policy as a `Content-Security-Policy` meta tag so the restriction still applies before the server config is updated.
