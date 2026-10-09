#!/bin/sh
# The pilot task, headless: for each allowlisted URL given as an argument, save a
# screenshot and the page's text into /work/out. No desktop, no window manager.
# Usage (from the runner, as argv, never through a shell): task.sh URL [URL [URL]]
set -e
[ $# -ge 1 ] && [ $# -le 3 ] || { echo "task: give 1 to 3 URLs" >&2; exit 2; }
export HOME=/tmp   # root filesystem is read-only; chromium writes its profile under HOME (tmpfs)
mkdir -p /work/out /tmp/.pki/nssdb
# Chromium reads trust from NSS, not the system store: trust the pilot proxy's CA there.
certutil -d sql:/tmp/.pki/nssdb -N --empty-password
certutil -d sql:/tmp/.pki/nssdb -A -t C,, -n kaizen-pilot -i /usr/local/share/ca-certificates/kaizen-pilot.crt
# Done like a person, on a screen the user watches live: one visible Chromium window,
# the URL typed into its address bar, the page loaded, then its text read and its
# screenshot taken from that same tab (over the DevTools port, which listens on the
# sandbox's loopback only). The runner streams this screen to the card.
mkdir -p /tmp/live
step() { printf '%s' "$1" > /tmp/live/step.txt; }   # what the user reads above the live screen
export DISPLAY=:99
step "Turning on the screen"
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp >/dev/null 2>&1 &
XVFB=$!
trap 'kill $BROWSER $XVFB 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do xdpyinfo >/dev/null 2>&1 && break; sleep 0.2; done
step "Opening the browser"
chromium-browser --no-sandbox --disable-gpu --proxy-server=http://proxy:3128 --user-data-dir=/tmp/chrome \
  --no-first-run --no-default-browser-check --disable-crash-reporter --disable-dev-shm-usage --disable-background-networking \
  --disable-features=Translate,MediaRouter --password-store=basic --test-type \
  --window-size=1280,800 --window-position=0,0 --remote-debugging-port=9222 about:blank >/dev/null 2>&1 &
BROWSER=$!
python3 /opt/cdp.py ready
sleep 1
n=0
for url in "$@"; do
  n=$((n+1))
  case "$url" in http://*|https://*) ;; *) echo "task: not a web URL: $url" >&2; exit 2;; esac
  step "Typing $url into the address bar ($n of $#)"
  xdotool search --sync --onlyvisible --class chromium windowactivate --sync >/dev/null 2>&1 || true
  xdotool key --clearmodifiers ctrl+l
  sleep 0.3
  xdotool type --delay 45 -- "$url"
  sleep 0.4
  xdotool key Return
  step "Loading $url ($n of $#)"
  python3 /opt/cdp.py wait
  sleep 1.5
  step "Reading the text of the page ($n of $#)"
  python3 /opt/cdp.py html > "/work/page-$n.html"
  sleep 1
  step "Taking a screenshot ($n of $#)"
  python3 /opt/cdp.py shot "/work/out/page-$n.png"
  sleep 1
done
step "Writing result.csv"
python3 - "$@" <<'PY'
import csv, sys
from html.parser import HTMLParser
KEEP = {"h1", "h2", "h3", "p", "li", "td"}
class P(HTMLParser):
    def __init__(s): super().__init__(); s.rows, s.tag, s.buf = [], None, []
    def handle_starttag(s, t, a):
        if t in KEEP: s.flush(); s.tag = t
    def handle_endtag(s, t):
        if t == s.tag: s.flush()
    def handle_data(s, d):
        if s.tag: s.buf.append(d)
    def flush(s):
        text = " ".join("".join(s.buf).split())
        if s.tag and text: s.rows.append((s.tag, text))
        s.tag, s.buf = None, []
with open("/work/out/result.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(("url", "tag", "text"))
    for i, url in enumerate(sys.argv[1:], 1):
        p = P(); p.feed(open(f"/work/page-{i}.html", errors="replace").read()); p.flush()
        for tag, text in p.rows: w.writerow((url, tag, text))
PY
ls /work/out
