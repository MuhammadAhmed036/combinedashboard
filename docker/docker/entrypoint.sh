#!/bin/sh
set -e

# Standalone's server.js is launched directly (`node server.js`), which
# bypasses the `prestart` npm hook check-env.mjs normally runs under. This
# replaces it so a missing/placeholder .env still fails loudly at container
# start instead of serving a broken app.
node /app/scripts/check-env.mjs

exec "$@"
