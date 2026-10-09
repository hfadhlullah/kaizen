# Policy tests, no network. Run: python3 test_addon.py (or pytest).
import socket
from addon import check_request, pick_address

OK = None


def req(**k):
    a = dict(method="GET", scheme="https", asked="example.com", port=443, sni="example.com",
             host_header="example.com", has_body=False, upgrade=False)
    a.update(k)
    return check_request(**a)


def resolver(*answers):
    """getaddrinfo stub; with several answers it returns the next one on each call (rebinding)."""
    seq = list(answers)
    def f(host, port, *_):
        ips = seq.pop(0) if len(seq) > 1 else seq[0]
        return [(0, 0, 0, "", (ip, port)) for ip in ips]
    return f


def blocked(host, *answers, port=443):
    try:
        pick_address(host, port, resolver(*answers))
    except PermissionError:
        return True
    return False


def test_allowed_get_and_head():
    assert req() is OK
    assert req(method="HEAD") is OK
    assert req(scheme="http", port=80, sni="") is OK
    assert req(host_header="EXAMPLE.com:443") is OK


def test_names():
    assert req(asked="wikipedia.org", sni="wikipedia.org", host_header="wikipedia.org")
    assert req(port=8443)
    assert req(port=22)
    assert req(asked="fixture.test", sni="fixture.test", host_header="fixture.test")  # https on a fixture
    assert req(scheme="http", port=80, asked="fixture.test", sni="", host_header="fixture.test") is OK


def test_fronting():
    assert req(host_header="www.wikipedia.org") == "Host header does not match the requested name"
    assert req(sni="www.wikipedia.org") == "SNI does not match the requested name"
    assert req(sni="") == "SNI does not match the requested name"
    assert req(scheme="http", port=80, sni="", host_header="evil.example.net")


def test_writes():
    for m in ("POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"):
        assert req(method=m) == "method not allowed", m
    assert req(has_body=True) == "request body not allowed"
    assert req(upgrade=True) == "protocol upgrade not allowed"


def test_addresses():
    assert pick_address("example.com", 443, resolver(["93.184.215.14"])) == "93.184.215.14"
    for bad in (["10.0.0.1"], ["127.0.0.1"], ["169.254.169.254"], ["192.168.1.1"], ["172.17.0.1"], ["100.64.0.1"],
                ["::1"], ["fe80::1"], ["fc00::1"], ["::ffff:10.0.0.1"], ["::ffff:169.254.169.254"],
                ["93.184.215.14", "10.0.0.1"]):
        assert blocked("example.com", bad), bad
    assert blocked("1.1.1.1", ["1.1.1.1"])
    assert blocked("[::1]", ["::1"])
    assert not blocked("fixture.test", ["172.18.0.3"], port=80)


def test_rebinding():
    # First lookup public, every later one private: the dial uses the one checked answer,
    # and a second resolution is checked again rather than trusted.
    r = resolver(["93.184.215.14"], ["10.0.0.1"])
    assert pick_address("example.com", 443, r) == "93.184.215.14"
    try:
        pick_address("example.com", 443, r)
        assert False, "second, private answer accepted"
    except PermissionError:
        pass


if __name__ == "__main__":
    n = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); n += 1
    print(f"{n} policy tests passed")
