#!/usr/bin/env python3
"""
CryptCrawler web server — serves the 2D canvas client and bridges room
narration requests to the live DungeonMaster (Gemini CLI).

Pure stdlib, no dependencies. Run:

    python3 server.py
    # then open http://localhost:8000
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from dungeon import DungeonMaster

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))

# One dungeon master per process keeps room_history (so Gemini avoids repeats).
DM = DungeonMaster()

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    # Quieter logging — one line per request is plenty.
    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    # ── static files ──────────────────────────────────────────────────────
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"

        # Prevent path traversal: resolve and confirm it stays inside WEB_DIR.
        target = os.path.normpath(os.path.join(WEB_DIR, path.lstrip("/")))
        if not target.startswith(WEB_DIR) or not os.path.isfile(target):
            self.send_error(404, "Not found")
            return

        ext = os.path.splitext(target)[1]
        ctype = CONTENT_TYPES.get(ext, "application/octet-stream")
        with open(target, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── narration API ─────────────────────────────────────────────────────
    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/narrate":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "bad request"})
            return

        ctx = {
            "hp": int(payload.get("hp", 20)),
            "max_hp": int(payload.get("max_hp", 20)),
            "items": list(payload.get("items", []))[-3:],
        }
        depth = int(payload.get("depth", 0))

        room = DM.generate_room(ctx, depth)
        self._json(200, room)

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print("\n  ▓ CryptCrawler 2D — server running")
    print(f"  ▸ open  {url}")
    print("  ▸ live narration via Gemini CLI (falls back to handcrafted rooms)")
    print("  ▸ Ctrl-C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  shutting down…")
        server.shutdown()


if __name__ == "__main__":
    main()
