#!/bin/sh
# Before nginx starts: the basic-auth file from BASIC_AUTH_USER / BASIC_AUTH_PASSWORD (set in .env).
# No credentials, no start: the app is never served without a password by mistake.
set -eu
: "${BASIC_AUTH_USER:?set BASIC_AUTH_USER in .env}"
: "${BASIC_AUTH_PASSWORD:?set BASIC_AUTH_PASSWORD in .env}"
printf '%s:%s\n' "$BASIC_AUTH_USER" "$(openssl passwd -apr1 "$BASIC_AUTH_PASSWORD")" > /tmp/htpasswd
