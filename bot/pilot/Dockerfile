# The disposable sandbox: Chromium on a virtual screen (Xvfb) the user watches live, curl,
# python, as uid 1000. Its only way out is the pilot proxy, whose CA is trusted here so
# the proxy can read HTTPS.
FROM alpine:3.20
RUN apk add --no-cache chromium curl python3 bind-tools font-noto nss-tools openssl ca-certificates xvfb xdpyinfo xdotool ffmpeg py3-websocket-client \
 && adduser -D -u 1000 bot
COPY --from=ca mitmproxy-ca-cert.pem /usr/local/share/ca-certificates/kaizen-pilot.crt
RUN update-ca-certificates 2>/dev/null
USER 1000
WORKDIR /work
COPY --chmod=755 probes.sh task.sh cdp.py /opt/
