# Egress policy for the Kaizen Bot computer pilot, as a mitmproxy addon.
#
# mitmproxy terminates TLS, so every request is seen in clear and checked here:
#  - the name the client asked for (CONNECT target, or the URL host for plain http),
#    the TLS SNI and the Host header must all be the same allowlisted name, which
#    closes domain fronting through a shared CDN address;
#  - only GET and HEAD, with no body and no protocol upgrade, so nothing is written;
#  - the upstream address is resolved here, once, and must be globally routable
#    (fixture hosts excepted), and mitmproxy then verifies the real site's
#    certificate for that name.
# Redirects go back to the browser; its next request comes through these checks again.
# One JSON line per decision goes to stdout. No headers, bodies or query strings.
import ipaddress, json, os, socket, sys, time
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY = json.load(open(os.environ.get("ALLOWLIST", os.path.join(HERE, "allowlist.json"))))
HOSTS = {h.lower() for h in POLICY["hosts"]}
FIXTURES = {h.lower() for h in POLICY.get("fixtures", [])}  # plain http only, may be private
TASK = os.environ.get("TASK", "")


def log(decision, reason, method="", host="", path="", ip=""):
    print(json.dumps({"t": round(time.time(), 3), "task": TASK, "decision": decision, "reason": reason,
                      "method": method, "host": host, "path": path, "ip": ip}), flush=True)


def norm(host):
    return (host or "").strip().lower().rstrip(".")


def host_of(header):
    """Host header without its port; a bracketed IPv6 literal stays itself."""
    h = norm(header)
    if h.startswith("["):
        return h.split("]")[0] + "]"
    return h.rsplit(":", 1)[0] if ":" in h else h


def allowed_name(host, port, scheme):
    """None when the destination may be asked for, else the reason it may not."""
    if host in FIXTURES:
        return None if (scheme, port) == ("http", 80) else "fixture is http on port 80 only"
    if host not in HOSTS:
        return "not allowlisted"
    if (scheme, port) not in (("http", 80), ("https", 443)):
        return "port not allowed"
    return None


def check_request(method, scheme, asked, port, sni, host_header, has_body, upgrade):
    """The whole per-request rule. `asked` is the CONNECT target for https, the URL host for http."""
    asked = norm(asked)
    why = allowed_name(asked, port, scheme)
    if why:
        return why
    if scheme == "https" and norm(sni) != asked:
        return "SNI does not match the requested name"
    if host_of(host_header) != asked:
        return "Host header does not match the requested name"
    if method not in ("GET", "HEAD"):
        return "method not allowed"
    if has_body:
        return "request body not allowed"
    if upgrade:
        return "protocol upgrade not allowed"
    return None


def pick_address(host, port, resolve=socket.getaddrinfo):
    """Resolve once; every answer must be global (fixtures may be private). Returns the IP to dial."""
    host = norm(host)
    try:
        ipaddress.ip_address(host.strip("[]"))
        raise PermissionError("IP literals are never allowlisted")
    except ValueError:
        pass
    infos = resolve(host, port, 0, socket.SOCK_STREAM)
    ips = [i[4][0] for i in infos]
    if not ips:
        raise PermissionError("no address")
    for ip in ips:
        a = ipaddress.ip_address(ip.split("%")[0])
        if getattr(a, "ipv4_mapped", None):
            a = a.ipv4_mapped
        if host not in FIXTURES and not a.is_global:
            raise PermissionError(f"resolves to non-global {ip}")
    return ips[0]


class Policy:
    def __init__(self):
        self.asked = {}  # client connection id -> CONNECT target name

    def http_connect(self, flow):
        host, port = norm(flow.request.host), flow.request.port
        why = allowed_name(host, port, "https")
        if why:
            log("DENY", why, "CONNECT", host)
            from mitmproxy import http
            flow.response = http.Response.make(403, b"blocked by pilot proxy: " + why.encode())
            return
        self.asked[flow.client_conn.id] = host

    def request(self, flow):
        r = flow.request
        https = r.scheme == "https"
        asked = self.asked.get(flow.client_conn.id, "") if https else norm(urlsplit(r.url).hostname or "")
        has_body = bool(r.raw_content) or "content-length" in r.headers and r.headers["content-length"] != "0" \
            or "transfer-encoding" in r.headers
        why = check_request(r.method, r.scheme, asked, r.port, flow.client_conn.sni or "", r.host_header or "",
                            has_body, "upgrade" in r.headers)
        path = r.path.split("?")[0][:200]
        if why:
            log("DENY", why, r.method, asked or norm(r.host_header or ""), path)
            from mitmproxy import http
            flow.response = http.Response.make(403, b"blocked by pilot proxy: " + why.encode())
            return
        log("ALLOW", "", r.method, asked, path)

    def server_connect(self, data):
        host, port = data.server.address
        try:
            ip = pick_address(host, port)
        except Exception as e:
            log("DENY", f"upstream: {e}", "", norm(host))
            data.server.error = f"blocked by pilot proxy: {e}"
            return
        if norm(host) not in FIXTURES:
            data.server.sni = norm(host)  # certificate is verified for the name, not the IP
        data.server.address = (ip, port)
        log("DIAL", "", "", norm(host), "", ip)

    def client_disconnected(self, client):
        self.asked.pop(client.id, None)


addons = [Policy()]
