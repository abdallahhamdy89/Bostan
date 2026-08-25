#!/bin/bash

set -e

APP_DIR="/home/ubuntu/Bostan"
NODE_BIN="/home/ubuntu/node-v22.23.2-linux-arm64/bin"

export PRISMA_SCHEMA_ENGINE_BINARY="$APP_DIR/schema-engine"

cd "$APP_DIR"

echo "========================================"
echo " Bostan Deployment"
echo "========================================"
echo

echo "==> Checking working tree..."

if [ -n "$(git status --porcelain)" ]; then
    echo
    echo "WARNING: Working tree contains local changes:"
    git status --short
    echo
    echo "Deployment stopped to avoid overwriting local changes."
    exit 1
fi

echo
echo "==> Pulling latest code..."
git pull --ff-only

echo
echo "==> Installing dependencies..."
"$NODE_BIN/npm" ci

echo
echo "==> Generating Prisma client..."
"$NODE_BIN/npx" prisma generate

echo
echo "==> Applying database migrations..."
"$NODE_BIN/npx" prisma migrate deploy

echo
echo "==> Restarting Bostan API..."
sudo systemctl restart bostan-api.service

echo
echo "==> Restarting Bostan UI..."
sudo systemctl restart bostan-ui.service

echo
echo "==> Waiting for services..."
sleep 3

echo
echo "==> API status:"
sudo systemctl --no-pager --full status bostan-api.service

echo
echo "==> UI status:"
sudo systemctl --no-pager --full status bostan-ui.service

echo
echo "==> Testing API..."

if curl -sf http://localhost:3001 >/dev/null; then
    echo "API is responding."
else
    echo "WARNING: API did not respond."
    exit 1
fi

echo
echo "==> Testing UI..."

if curl -sf http://localhost:5173 >/dev/null; then
    echo "UI is responding."
else
    echo "WARNING: UI did not respond."
    exit 1
fi

echo
echo "========================================"
echo " Deployment completed successfully!"
echo "========================================"
