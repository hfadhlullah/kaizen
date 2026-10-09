#!/bin/sh
# One-time setup for the local pilot: the proxy CA, then the three images.
# The CA's private key stays in bot/data/pilot-ca (gitignored) and in the local proxy image.
set -e
cd "$(dirname "$0")"
CA=../data/pilot-ca
if [ ! -f $CA/mitmproxy-ca.pem ]; then
  mkdir -p $CA && chmod 700 $CA
  # mitmdump writes its CA on first start; give it a moment, then stop it.
  docker run --rm -d --name kz-pilot-cagen --user "$(id -u)" --entrypoint mitmdump -v "$(realpath $CA):/ca" mitmproxy/mitmproxy:11 \
    --set confdir=/ca >/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do [ -f $CA/mitmproxy-ca.pem ] && break; sleep 1; done
  docker rm -f kz-pilot-cagen >/dev/null
  [ -f $CA/mitmproxy-ca.pem ] || { echo "CA was not created"; exit 1; }
  echo "created pilot CA in $CA"
fi
docker build -q --build-context ca=$CA -t kz-pilot-proxy proxy >/dev/null
docker build -q -t kz-pilot-fixture fixture >/dev/null
docker build -q --build-context ca=$CA -t kz-pilot-sandbox . >/dev/null
docker run --rm --network none -w /pilot --entrypoint python3 kz-pilot-proxy test_addon.py
echo "images: kz-pilot-proxy kz-pilot-fixture kz-pilot-sandbox"
