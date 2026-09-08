#!/usr/bin/env python3
"""A recording pass-through in front of the ML service, for the interaction-path siloing check.

The realtime server posts every per-actor BehavioralEvent to `${ML_SERVICE_URL}/observe/behavioral`.
Pointing ML_SERVICE_URL at this process instead of at ML gives the harness the actual bytes the
server emitted, which is the only way to CONFIRM both events of an interaction were emitted rather
than infer it from a posterior that moved.

It changes nothing: every request is relayed verbatim to the real ML service, headers and all, and
the real response is returned. It exists only inside the harness run and is never in the product's
path. Nothing here is a parallel measurement path — the events still reach the same
/observe/behavioral ingress, and the posterior is still read from the same ML service.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ML = os.environ.get("ML", "http://127.0.0.1:8000")
LOG = os.environ.get("F4_PROXY_LOG", "/tmp/f4_observe.jsonl")
PORT = int(os.environ.get("PROXY_PORT", "8010"))


class Relay(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _relay(self, method: str) -> None:
        n = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(n) if n else None

        if method == "POST" and self.path.startswith("/observe/behavioral") and body:
            try:
                with open(LOG, "a") as f:
                    f.write(json.dumps(json.loads(body)) + "\n")
                    f.flush()
            except Exception:
                pass  # recording is observational; it must never break the relay

        req = urllib.request.Request(ML + self.path, data=body, method=method)
        for k, v in self.headers.items():
            if k.lower() not in ("host", "content-length", "connection", "accept-encoding"):
                req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data, code = r.read(), r.status
        except urllib.error.HTTPError as e:
            data, code = e.read(), e.code
        except Exception as e:
            data, code = json.dumps({"error": str(e)}).encode(), 502

        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        self._relay("POST")

    def do_GET(self) -> None:
        self._relay("GET")

    def log_message(self, *_args) -> None:
        pass


if __name__ == "__main__":
    open(LOG, "w").close()
    ThreadingHTTPServer(("127.0.0.1", PORT), Relay).serve_forever()
