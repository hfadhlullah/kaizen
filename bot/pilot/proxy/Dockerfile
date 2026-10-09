FROM mitmproxy/mitmproxy:11
COPY --from=ca --chown=mitmproxy mitmproxy-ca.pem mitmproxy-ca-cert.pem /home/mitmproxy/.mitmproxy/
COPY addon.py allowlist.json test_addon.py /pilot/
USER mitmproxy
# lazy: no upstream connection until a request has passed the policy.
ENTRYPOINT ["mitmdump", "-q", "-s", "/pilot/addon.py", "--listen-port", "3128", "--set", "connection_strategy=lazy", "--set", "block_global=false"]
