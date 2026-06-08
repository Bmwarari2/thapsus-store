#!/bin/sh
if [ "$SERVICE_TYPE" = "worker" ]; then
  exec node apps/worker/dist/index.js
else
  exec node apps/api/dist/server.js
fi
