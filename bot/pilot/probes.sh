#!/bin/sh
# Runs inside the sandbox. Each check prints PASS or FAIL; exit status is the FAIL count.
P=http://proxy:3128; fails=0
export HOME=/tmp
ok()   { echo "PASS  $1"; }
bad()  { echo "FAIL  $1"; fails=$((fails+1)); }
# expect_block <name> <curl args...>: passes when the request does not reach the target.
expect_block() { n=$1; shift; c=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$@" 2>/dev/null); case $c in 2??|3??) bad "$n blocked (got $c)";; *) ok "$n blocked ($c)";; esac; }
expect_reach() { n=$1; shift; c=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$@" 2>/dev/null); case $c in 2??) ok "$n reachable ($c)";; *) bad "$n reachable (got $c)";; esac; }

[ "$(id -u)" != 0 ] && ok "runs as uid $(id -u)" || bad "runs as root"
grep -q ' / overlay ro' /proc/mounts && ok "root filesystem read-only" || bad "root filesystem writable"
# Docker always binds /etc/hosts, /etc/hostname, /etc/resolv.conf; anything else from the host is a mount we did not intend.
extra=$(awk '$2!~"^/(proc|sys|dev)" && $2!="/" && $2!="/etc/hosts" && $2!="/etc/hostname" && $2!="/etc/resolv.conf" && $2!="/work" && $2!="/tmp" {print $2}' /proc/mounts)
[ -z "$extra" ] && ok "no host mounts" || bad "unexpected mounts: $extra"
[ ! -e /var/run/docker.sock ] && ok "no docker socket" || bad "docker socket present"
grep -q '^CapEff:	0000000000000000' /proc/self/status && ok "no capabilities" || bad "has capabilities"
sudo -n true 2>/dev/null && bad "sudo works" || ok "no privilege escalation (sudo)"

# Quotas
python3 -c 'b=bytearray(900*1024*1024)' 2>/dev/null; [ $? -ne 0 ] && ok "memory cap kills 900 MB allocation" || bad "900 MB allocation succeeded"
dd if=/dev/zero of=/work/big bs=1M count=300 2>/dev/null; [ $? -ne 0 ] && ok "workspace cap stops 300 MB write" || bad "300 MB write succeeded"; rm -f /work/big
# Python, not a shell loop: busybox sh retries a failed fork forever and pins the cap.
n=$(python3 -c '
import os, time
kids = []
try:
    for _ in range(400):
        pid = os.fork()
        if pid == 0: time.sleep(30); os._exit(0)
        kids.append(pid)
except OSError: pass
print(len(kids))
for k in kids: os.kill(k, 9); os.waitpid(k, 0)')
[ "${n:-999}" -lt 260 ] && ok "pids cap stops fork at $n processes" || bad "pids cap missing (forked ${n:-?})"

# Direct egress, bypassing the proxy: the sandbox network has no route out.
expect_block "direct public IP 1.1.1.1"            --noproxy '*' http://1.1.1.1/
expect_block "direct metadata 169.254.169.254"     --noproxy '*' http://169.254.169.254/latest/meta-data/
expect_block "direct docker host gateway"          --noproxy '*' http://172.17.0.1/
expect_block "direct private 10.0.0.1"             --noproxy '*' http://10.0.0.1/
expect_block "direct private 192.168.1.1"          --noproxy '*' http://192.168.1.1/
expect_block "direct IPv6 loopback"                --noproxy '*' 'http://[::1]/'
expect_block "direct IPv6 link-local"              --noproxy '*' 'http://[fe80::1]/'
expect_block "direct DNS to 8.8.8.8"               --noproxy '*' telnet://8.8.8.8:53

# Through the proxy (TLS terminated there, so every check sees the real request)
expect_reach "allowlisted example.com (https)"     -x $P https://example.com/
expect_reach "allowlisted example.com (http)"      -x $P http://example.com/
expect_reach "fixture page (http)"                 -x $P http://fixture.test/
expect_reach "HEAD on allowlisted site"            -I -x $P https://example.com/
expect_block "not allowlisted wikipedia.org"       -x $P https://www.wikipedia.org/
expect_block "not allowlisted example.net"         -x $P https://example.net/
expect_block "metadata via proxy"                  -x $P http://169.254.169.254/latest/meta-data/
expect_block "loopback via proxy"                  -x $P http://127.0.0.1/
expect_block "IPv6 loopback via proxy"             -x $P 'http://[::1]/'
expect_block "allowlisted host on a non-web port"  -x $P https://example.com:8443/
expect_block "fixture over https"                  -x $P https://fixture.test/
# Domain fronting: ask for an allowed name, talk to another site on the same CDN.
expect_block "fronting: Host differs from CONNECT name" -x $P -H 'Host: www.wikipedia.org' https://example.com/
expect_block "fronting: plain http Host differs"   -x $P -H 'Host: www.wikipedia.org' http://example.com/
r=$(printf 'GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n' | timeout 10 openssl s_client -quiet -proxy proxy:3128 -connect example.com:443 -servername www.wikipedia.org 2>/dev/null | head -1)
case "$r" in *" 200 "*) bad "fronting: SNI differs from CONNECT name (got $r)";; *) ok "fronting: SNI differs from CONNECT name blocked (${r:-no response})";; esac
# Writes
expect_block "POST to fixture form"                -x $P -d q=test http://fixture.test/submit
expect_block "POST to allowlisted site (https)"  -x $P -d q=1 https://example.com/
expect_block "PUT to allowlisted site"             -x $P -X PUT -d x https://example.com/
expect_block "DELETE to allowlisted site"          -x $P -X DELETE https://example.com/
expect_block "GET with a body"                     -x $P -X GET -d x https://example.com/
expect_block "websocket upgrade"                   -x $P -H 'Connection: Upgrade' -H 'Upgrade: websocket' http://fixture.test/
# Redirects: followed by the client, so the next hop is checked again.
expect_block "redirect from fixture to off-list site" -L -x $P http://fixture.test/redirect-off-list
expect_block "redirect from fixture to metadata"   -L -x $P http://fixture.test/redirect-metadata
# Allowlisted-looking names that resolve somewhere private are not on the list, and
# the rule that refuses a private answer for a listed name is unit-tested in test_addon.py.
expect_block "rebinding-style name (localtest.me)" -x $P http://localtest.me/

echo "fails=$fails"; exit $fails
