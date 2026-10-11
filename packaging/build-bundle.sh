#!/usr/bin/env bash
# Builds the offline install bundle for combinedashboard.
#
#   packaging/build-bundle.sh [output-dir]      (default: ../dist/test next to the repo)
#
# - Images are built from `git archive HEAD` only (committed source, no .env in
#   the build context, no NEXT_PUBLIC_* at build time). Refuses to run when
#   application code differs from HEAD; only packaging files may be uncommitted
#   (they are listed in VERSION).
# - Bundles: images (docker save), install.sh, docker-compose.yml, .env.example,
#   defaults.env (the repo's current .env with NEXT_PUBLIC_LUNA_WS_URL emptied,
#   mode 600 — real credentials!),
#   database/init-db, helper scripts, README_INSTALL.md, VERSION, CHANGELOG.md.
# - Never overwrites an existing bundle.
set -euo pipefail

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO"
OUT_DIR="$(realpath -m "${1:-$REPO/../dist/test}")"

VERSION="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' frontend/package.json | head -1)"
COMMIT_FULL="$(git rev-parse HEAD)"
COMMIT="$(git rev-parse --short=7 HEAD)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TAG="combined-${VERSION}-${COMMIT}"
NAME="combinedashboard_${VERSION}_${COMMIT}_offline_UNTESTED"
TARBALL="$OUT_DIR/$NAME.tar.gz"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

[ -n "$VERSION" ] || die "cannot read version from frontend/package.json"
[ -e "$TARBALL" ] && die "$TARBALL already exists — not overwriting"
[ -f .env ] || die "no .env in $REPO (it becomes defaults.env)"

step "Source check (commit $COMMIT on $BRANCH)"
# Only packaging/docs paths may differ from HEAD; application code must be committed.
PACKAGING_RE='^(packaging/|docker-compose\.yml$|docker/docker-compose\.yml$|\.env\.example$|deploy\.sh$|install-docker-offline\.sh$|status\.sh$|stop\.sh$|check-port\.sh$|update-env\.sh$|repair-db-password\.sh$|repair-schema\.sh$|scripts/|README\.md$|CHANGELOG\.md$|AUDIT_PIPELINE_INTEGRATION\.md$)'
CHANGED="$(git status --porcelain --untracked-files=all | cut -c4- | sed 's/.* -> //')"
BAD="$(printf '%s\n' "$CHANGED" | grep -v '^$' | grep -Ev "$PACKAGING_RE" || true)"
[ -z "$BAD" ] || die "uncommitted changes outside packaging files (commit them first):
$BAD"
PACKAGING_CHANGES="$(printf '%s\n' "$CHANGED" | grep -v '^$' | tr '\n' ' ' | sed 's/ $//')"
echo "application source: HEAD $COMMIT_FULL"
echo "uncommitted packaging files: ${PACKAGING_CHANGES:-none}"

WORK="$(mktemp -d -p "$HOME" .combined-bundle.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
SRC="$WORK/src"; mkdir -p "$SRC"
git archive HEAD | tar -x -C "$SRC"
[ ! -e "$SRC/.env" ] || die ".env is tracked in git — refusing"

step "Building images $TAG from committed source (no NEXT_PUBLIC_* at build time)"
build() { # build image context [dockerfile]
  local image="$1" ctx="$2" file="${3:-}"
  env -u NEXT_PUBLIC_LUNA_WS_URL -u NEXT_PUBLIC_LUNA_API_URL -u NEXT_PUBLIC_LUNA_HOST -u NEXT_PUBLIC_LUNA_PORT \
      -u NEXT_PUBLIC_LUNA_ACCOUNT_ID -u NEXT_PUBLIC_LUNA_AUTH_USER -u NEXT_PUBLIC_LUNA_AUTH_PASS -u NEXT_PUBLIC_LUNA_WS_PORT \
    docker build -q -t "$image" ${file:+-f "$file"} \
      --label "org.opencontainers.image.revision=$COMMIT_FULL" --label "org.opencontainers.image.version=$VERSION" \
      "$ctx" >/dev/null
  echo "  built $image"
}
APP_IMAGE="safecity-ai-dashboard:$TAG"
WS_IMAGE="safecity-person-count-ws:$TAG"
SYNC_IMAGE="safecity-sync:$TAG"
LUNA_IMAGE="safecity-luna-ws:$TAG"
build "$APP_IMAGE" "$SRC" "$SRC/docker/Dockerfile"
build "$WS_IMAGE" "$SRC/websocket/person-count-ws"
build "$SYNC_IMAGE" "$SRC/workers/sync-service"
build "$LUNA_IMAGE" "$SRC/websocket/luna-ws"

step "Pinning PostgreSQL"
PG_SRC="postgres:16-alpine"
docker image inspect "$PG_SRC" >/dev/null 2>&1 || die "$PG_SRC not present locally (no internet pulls here)"
PG_VERSION="$(docker image inspect "$PG_SRC" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^PG_VERSION=//p')"
PG_IMAGE="postgres:${PG_VERSION}-alpine"
if docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
  [ "$(docker image inspect -f '{{.Id}}' "$PG_IMAGE")" = "$(docker image inspect -f '{{.Id}}' "$PG_SRC")" ] || die "$PG_IMAGE exists with a different image id"
else
  docker tag "$PG_SRC" "$PG_IMAGE"
fi
echo "  $PG_IMAGE ($(docker image inspect -f '{{.Id}}' "$PG_IMAGE" | cut -c1-19))"
IMAGES="$APP_IMAGE $WS_IMAGE $SYNC_IMAGE $LUNA_IMAGE $PG_IMAGE"

step "Assembling $NAME"
STAGE="$WORK/$NAME"
mkdir -p "$STAGE/images" "$STAGE/scripts" "$STAGE/database"
cp packaging/install.sh packaging/README_INSTALL.md "$STAGE/"
cp docker-compose.yml .env.example check-port.sh status.sh stop.sh install-docker-offline.sh CHANGELOG.md "$STAGE/"
cp scripts/check-ports.sh scripts/verify-pipeline.sh "$STAGE/scripts/"
cp -r "$SRC/database/init-db" "$STAGE/database/init-db"
# defaults.env = the repo's .env, except NEXT_PUBLIC_LUNA_WS_URL is written empty so
# browsers use ws://<page host>:LUNA_WS_PORT (the repo's .env itself is not changed).
( umask 077; sed 's/^NEXT_PUBLIC_LUNA_WS_URL=.*/NEXT_PUBLIC_LUNA_WS_URL=/' .env > "$STAGE/defaults.env" )
chmod 600 "$STAGE/defaults.env"
chmod 755 "$STAGE"/*.sh "$STAGE"/scripts/*.sh
cat > "$STAGE/VERSION" <<EOF
# combinedashboard offline bundle (sourced by install.sh)
BUNDLE_VERSION="$VERSION"
GIT_COMMIT="$COMMIT_FULL"
GIT_COMMIT_SHORT="$COMMIT"
GIT_BRANCH="$BRANCH"
IMAGE_TAG="$TAG"
POSTGRES_IMAGE="$PG_IMAGE"
IMAGES_ARCHIVE="images/combined-images.tar"
IMAGES="$IMAGES"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Application images: built from HEAD only. Packaging files that were not yet
# committed when this bundle was built (copied from the working tree):
PACKAGING_UNCOMMITTED="$PACKAGING_CHANGES"
EOF
echo "  saving images (this takes a while)"
# shellcheck disable=SC2086
docker save -o "$STAGE/images/combined-images.tar" $IMAGES

step "Writing $TARBALL"
mkdir -p "$OUT_DIR"
tar -C "$WORK" --numeric-owner -czf "$TARBALL" "$NAME"
(cd "$OUT_DIR" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
echo "  $(du -h "$TARBALL" | cut -f1)  $TARBALL"
echo "  sha256 $(cut -d' ' -f1 "$TARBALL.sha256")"
echo "Next: packaging/verify-bundle.sh $TARBALL"
