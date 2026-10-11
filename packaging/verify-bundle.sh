#!/usr/bin/env bash
# Verifies an offline bundle built by build-bundle.sh.
#
#   packaging/verify-bundle.sh <bundle.tar.gz>
#
# Checks: sha256 file, VERSION commit = repo HEAD, defaults.env present with mode
# 600 and no .env/.env.bak-* in the tar, every image loads, and every secret from
# the repo's .env appears ONLY in defaults.env (not in scripts, compose, docs,
# image layers or the client JS bundle). Prints key names, never secret values.
set -uo pipefail

TARBALL="$(realpath "${1:?usage: verify-bundle.sh <bundle.tar.gz>}")"
REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
PASSN=0; FAILN=0
pass() { echo "PASS  $*"; PASSN=$((PASSN + 1)); }
fail() { echo "FAIL  $*"; FAILN=$((FAILN + 1)); }
info() { echo "INFO  $*"; }

WORK="$(mktemp -d -p "$HOME" .combined-verify.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

echo "== integrity"
(cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256" >/dev/null 2>&1) \
  && pass "sha256 $(cut -d' ' -f1 "$TARBALL.sha256")" || fail "sha256 mismatch or missing .sha256"
LISTING="$(tar -tvzf "$TARBALL")"
NAME="$(printf '%s\n' "$LISTING" | awk 'NR==1{print $6}' | cut -d/ -f1)"
printf '%s\n' "$LISTING" | awk '{print $6}' | grep -Eq '/\.env(\.bak-.*)?$' && fail ".env or .env.bak-* inside the tar" || pass "no .env / .env.bak-* inside the tar"
MODE="$(printf '%s\n' "$LISTING" | awk '$6 ~ /\/defaults\.env$/ {print $1}')"
[ "$MODE" = "-rw-------" ] && pass "defaults.env present, mode 600" || fail "defaults.env mode is '${MODE:-missing}' (want -rw-------)"
tar -xzf "$TARBALL" -C "$WORK"
B="$WORK/$NAME"
[ "$(grep -c '^NEXT_PUBLIC_LUNA_WS_URL=$' "$B/defaults.env")" = 1 ] && pass "defaults.env: NEXT_PUBLIC_LUNA_WS_URL empty" || fail "defaults.env: NEXT_PUBLIC_LUNA_WS_URL is not empty"
# shellcheck disable=SC1091
. "$B/VERSION"
[ "$GIT_COMMIT" = "$(git -C "$REPO" rev-parse HEAD)" ] && pass "VERSION commit $GIT_COMMIT_SHORT = HEAD" || fail "VERSION commit $GIT_COMMIT != HEAD $(git -C "$REPO" rev-parse HEAD)"
info "packaging files not yet committed when built: ${PACKAGING_UNCOMMITTED:-none}"

echo "== images"
docker load -i "$B/$IMAGES_ARCHIVE" >/dev/null && pass "image archive loads" || fail "docker load failed"
for img in $IMAGES; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$img")"
    case "$img" in postgres:*) pass "$img loads";; *) [ "$rev" = "$GIT_COMMIT" ] && pass "$img loads (revision label = HEAD)" || fail "$img revision label '$rev' != HEAD";; esac
  else fail "$img missing after load"; fi
done
grep -q "^IMAGE_TAG=\"combined-${BUNDLE_VERSION}-${GIT_COMMIT_SHORT}\"$" "$B/VERSION" && pass "image tag combined-${BUNDLE_VERSION}-${GIT_COMMIT_SHORT}" || fail "image tag does not follow combined-<version>-<commit>"

echo "== secrets (from $REPO/.env; only defaults.env may contain them)"
SECRETS="$WORK/secrets"; : > "$SECRETS"; SHORT_KEYS=""
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
  k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
  case "$k" in
    TEAM_DATABASE_URL|DATABASE_URL) [[ "$v" =~ ://[^:/@]+:([^@]+)@ ]] && v="${BASH_REMATCH[1]}" || v="" ;;
    *TOKEN*|*PASSWORD*|*_PASS|*SECRET*|*ENCRYPTION_KEY*) ;;
    *) continue ;;
  esac
  [ -z "$v" ] && continue
  if [ "${#v}" -lt 8 ]; then SHORT_KEYS="$SHORT_KEYS $k"; continue; fi
  printf '%s\t%s\n' "$k" "$v" >> "$SECRETS"
done < "$REPO/.env"
sort -u -o "$SECRETS" "$SECRETS"
info "$(wc -l < "$SECRETS") secret values >= 8 chars scanned by value"

scan() { # scan label path... -> prints key names whose value occurs
  local label="$1"; shift; local hits=""
  while IFS=$'\t' read -r k v; do
    grep -rqaF -- "$v" "$@" 2>/dev/null && hits="$hits $k"
  done < "$SECRETS"
  [ -z "$hits" ] && pass "$label: no secrets" || fail "$label contains:$hits"
}
missing=""; while IFS=$'\t' read -r k v; do grep -qF -- "$v" "$B/defaults.env" || missing="$missing $k"; done < "$SECRETS"
[ -z "$missing" ] && pass "defaults.env carries the secrets (expected)" || info "defaults.env lacks:$missing"
mapfile -t BUNDLE_FILES < <(find "$B" -type f ! -path "$B/defaults.env" ! -path "$B/$IMAGES_ARCHIVE")
scan "scripts, compose, docs, VERSION, init-db (${#BUNDLE_FILES[@]} files)" "${BUNDLE_FILES[@]}"
mkdir -p "$WORK/layers" && tar -xf "$B/$IMAGES_ARCHIVE" -C "$WORK/layers"
for f in $(find "$WORK/layers" -type f); do
  if gzip -t "$f" 2>/dev/null; then gunzip -c "$f" > "$f.raw" && rm -f "$f"; fi
done
scan "image layers + configs ($(find "$WORK/layers" -type f | wc -l) blobs, $(du -sh "$WORK/layers" | cut -f1))" "$WORK/layers"
APP_IMG="$(printf '%s\n' $IMAGES | grep '^safecity-ai-dashboard:')"
cid="$(docker create "$APP_IMG")"; docker cp "$cid:/app/.next/static" "$WORK/client-static" >/dev/null 2>&1; docker rm "$cid" >/dev/null
scan "client JS bundle (/app/.next/static, $(find "$WORK/client-static" -type f | wc -l) files)" "$WORK/client-static"
if grep -rqE 'ws://localhost:8092|NEXT_PUBLIC_[A-Z_]+="[^"]' "$WORK/client-static" 2>/dev/null; then fail "client bundle has a baked NEXT_PUBLIC_* value"; else pass "client bundle: no NEXT_PUBLIC_* values baked in (option a)"; fi
if [ -n "$SHORT_KEYS" ]; then
  # Values under 8 chars occur by chance in any binary; check the forms in which a credential would be stored.
  for k in $SHORT_KEYS; do
    v="$(sed -n "s/^$k=//p" "$REPO/.env" | tail -1)"
    hits=""
    grep -rqaF -- "$k=$v" "${BUNDLE_FILES[@]}" "$WORK/layers" "$WORK/client-static" 2>/dev/null && hits=" $k=<value>"
    if [ "$k" = LUNA_AUTH_PASS ]; then
      u="$(sed -n 's/^LUNA_AUTH_USER=//p' "$REPO/.env" | tail -1)"; b64="$(printf '%s:%s' "$u" "$v" | base64 -w0)"
      grep -rqaF -e "$u:$v" -e "$b64" "${BUNDLE_FILES[@]}" "$WORK/layers" "$WORK/client-static" 2>/dev/null && hits="$hits user:pass/Basic"
    fi
    [ -z "$hits" ] && pass "$k (short value): not stored outside defaults.env in credential form" || fail "$k found as:$hits"
  done
fi

echo
echo "passed $PASSN, failed $FAILN"
[ "$FAILN" = 0 ]
