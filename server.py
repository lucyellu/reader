"""
Dreams reader - local server.

Serves the static frontend plus three small APIs:
  GET /api/list?dir=<absolute-path>      list folders + book-like files in a dir
  GET /api/file?path=<absolute-path>     stream a local file (Range supported)
  GET /api/fetch?url=<url>               proxy-fetch a remote URL (for CORS)

Personal use; no auth. Only run on a trusted machine.
"""

import json
import mimetypes
import os
import re
import sys
import urllib.parse
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = 5757
ROOT = os.path.dirname(os.path.abspath(__file__))

BOOK_EXTS = {".epub", ".pdf", ".txt", ".md", ".html", ".htm"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

mimetypes.add_type("application/epub+zip", ".epub")
mimetypes.add_type("text/markdown", ".md")


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    # ---- routing ----
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/list":
                self.api_list(query)
            elif path == "/api/file":
                self.api_file(query)
            elif path == "/api/fetch":
                self.api_fetch(query)
            elif path == "/api/home":
                self.json_response({"home": os.path.expanduser("~"), "defaults": self.default_dirs()})
            else:
                self.serve_static(path)
        except BrokenPipeError:
            pass
        except Exception as exc:
            try:
                self.send_error(500, str(exc))
            except Exception:
                pass

    def do_HEAD(self):
        self.do_GET()

    # ---- static ----
    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        filepath = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
        if not filepath.startswith(ROOT):
            self.send_error(403, "Forbidden")
            return
        if not os.path.isfile(filepath):
            self.send_error(404, "Not found")
            return
        self.stream_file(filepath)

    # ---- /api/list ----
    def api_list(self, query):
        d = (query.get("dir") or [""])[0]
        if not d:
            d = os.path.expanduser("~")
        if not os.path.isdir(d):
            self.json_response({"error": "not a directory", "dir": d}, 400)
            return
        try:
            names = os.listdir(d)
        except PermissionError:
            self.json_response({"error": "permission denied", "dir": d}, 403)
            return

        folders, files = [], []
        for name in names:
            if name.startswith("."):
                continue
            full = os.path.join(d, name)
            try:
                if os.path.isdir(full):
                    folders.append({"name": name, "path": full, "isDir": True})
                else:
                    ext = os.path.splitext(name)[1].lower()
                    if ext not in BOOK_EXTS:
                        continue
                    files.append({
                        "name": name,
                        "path": full,
                        "isDir": False,
                        "size": os.path.getsize(full),
                        "ext": ext,
                    })
            except OSError:
                continue

        folders.sort(key=lambda x: x["name"].lower())
        files.sort(key=lambda x: x["name"].lower())

        parent = os.path.dirname(d.rstrip(os.sep))
        if parent == d or len(parent) < 3:
            parent = None

        self.json_response({
            "dir": d,
            "parent": parent,
            "folders": folders,
            "files": files,
        })

    # ---- /api/file ----
    def api_file(self, query):
        p = (query.get("path") or [""])[0]
        if not p or not os.path.isfile(p):
            self.send_error(404, "Not found")
            return
        self.stream_file(p)

    def stream_file(self, filepath):
        size = os.path.getsize(filepath)
        mime, _ = mimetypes.guess_type(filepath)
        mime = mime or "application/octet-stream"

        # Range support (helps pdf.js / browsers stream)
        range_header = self.headers.get("Range")
        start, end = 0, size - 1
        partial = False
        if range_header:
            m = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if m:
                s, e = m.group(1), m.group(2)
                if s:
                    start = int(s)
                if e:
                    end = int(e)
                end = min(end, size - 1)
                if start <= end:
                    partial = True

        length = end - start + 1

        if partial:
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)

        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        with open(filepath, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(remaining, 64 * 1024))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    return
                remaining -= len(chunk)

    # ---- /api/fetch (CORS-friendly proxy for URLs/articles) ----
    def api_fetch(self, query):
        url = (query.get("url") or [""])[0]
        if not url:
            self.json_response({"error": "missing url"}, 400)
            return
        if not (url.startswith("http://") or url.startswith("https://")):
            self.json_response({"error": "only http(s) urls"}, 400)
            return
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Dreams Reader) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
                ct = resp.headers.get("Content-Type", "text/html; charset=utf-8")
                self.send_response(200)
                self.send_header("Content-Type", ct)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("X-Final-Url", resp.url)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except Exception as exc:
            self.json_response({"error": str(exc), "url": url}, 502)

    # ---- helpers ----
    def default_dirs(self):
        candidates = [
            r"L:\Media\Text\Books",
            os.path.expanduser("~/Documents"),
            os.path.expanduser("~/Downloads"),
            os.path.expanduser("~/Desktop"),
        ]
        return [c for c in candidates if os.path.isdir(c)]

    def json_response(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    print(f"Dreams reader - http://localhost:{PORT}")
    print(f"Serving:      {ROOT}")
    print("Ctrl+C to stop.")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
