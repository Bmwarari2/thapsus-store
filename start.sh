#!/bin/sh
if [ "$SERVICE_TYPE" = "worker" ]; then
  exec node --dns-result-order=ipv4first apps/worker/dist/index.js
else
  exec node --dns-result-order=ipv4first apps/api/dist/server.js
fi
