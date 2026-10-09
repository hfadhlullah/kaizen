# The task's hands on the visible browser, over Chromium's DevTools port on the sandbox's
# own loopback. ready: wait for the port. wait: wait for the page to finish loading.
# html: print the page's HTML. shot FILE: save a PNG of the page.
import base64, json, sys, time, urllib.request
from websocket import create_connection

def tab():
    for _ in range(100):
        try:
            tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=1))
            pages = [t for t in tabs if t.get("type") == "page"]
            if pages:
                return pages[0]["webSocketDebuggerUrl"]
        except OSError:
            pass
        time.sleep(0.2)
    sys.exit("browser did not open")

def call(method, params=None):
    ws = create_connection(tab(), timeout=30, suppress_origin=True)
    try:
        ws.send(json.dumps({"id": 1, "method": method, "params": params or {}}))
        while True:
            m = json.loads(ws.recv())
            if m.get("id") == 1:
                return m.get("result", {})
    finally:
        ws.close()

def js(expr):
    return call("Runtime.evaluate", {"expression": expr, "returnByValue": True}).get("result", {}).get("value")

cmd = sys.argv[1]
if cmd == "ready":
    tab()
elif cmd == "wait":
    time.sleep(0.5)
    end = time.time() + 20
    while time.time() < end and js("document.readyState") != "complete":
        time.sleep(0.25)
elif cmd == "html":
    sys.stdout.write(js("document.documentElement.outerHTML") or "")
elif cmd == "shot":
    data = call("Page.captureScreenshot", {"format": "png"})["data"]
    open(sys.argv[2], "wb").write(base64.b64decode(data))
