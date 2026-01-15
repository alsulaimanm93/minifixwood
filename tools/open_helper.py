import json, os, time, threading, hashlib, mimetypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

HOST = "127.0.0.1"
PORT = 17832

CACHE_ROOT = os.path.join(os.environ.get("LOCALAPPDATA", os.getcwd()), "WorkshopCloud", "cache")
os.makedirs(CACHE_ROOT, exist_ok=True)

def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def _http_json(method: str, url: str, token: str | None, payload: dict | None) -> dict:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, data=data, headers=headers, method=method)
    with urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8")
        return json.loads(body) if body else {}

def _http_put(url: str, headers: dict, file_path: str) -> None:
    with open(file_path, "rb") as f:
        data = f.read()
    h = dict(headers or {})
    req = Request(url, data=data, headers=h, method="PUT")
    with urlopen(req, timeout=120) as r:
        r.read()

def _download(download_url: str, out_path: str) -> None:
    req = Request(download_url, method="GET")
    with urlopen(req, timeout=120) as r:
        data = r.read()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(data)

def _open_default(path: str) -> None:
    os.startfile(path)  # Windows default app

def _watch_and_upload(*, api_base: str, token: str | None, file_id: str, filename: str, mime: str | None, local_path: str):
    last_mtime = os.path.getmtime(local_path)
    last_hash = _sha256(local_path)

    while True:
        time.sleep(2.0)
        try:
            m = os.path.getmtime(local_path)
        except FileNotFoundError:
            return

        if m == last_mtime:
            continue

        # wait for "save" to finish (stable mtime)
        time.sleep(1.0)
        try:
            m2 = os.path.getmtime(local_path)
        except FileNotFoundError:
            return
        if m2 != m:
            continue

        new_hash = _sha256(local_path)
        if new_hash == last_hash:
            last_mtime = m2
            continue

        last_mtime = m2
        last_hash = new_hash

        try:
            size_bytes = os.path.getsize(local_path)
            guessed_mime = mime or (mimetypes.guess_type(filename)[0] or "application/octet-stream")

            init = _http_json(
                "POST",
                f"{api_base}/files/{file_id}/versions/initiate-upload",
                token,
                {"mime": guessed_mime, "size_bytes": size_bytes, "filename": filename},
            )

            _http_put(init["url"], init.get("headers") or {}, local_path)

            _http_json(
                "POST",
                f"{api_base}/files/{file_id}/versions/complete-upload",
                token,
                {"object_key": init["object_key"], "size_bytes": size_bytes, "etag": None},
            )

            print(f"[OK] Uploaded new version for {filename}")
        except Exception as e:
            print(f"[ERR] Upload failed for {filename}: {e}")

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        self.send_response(404)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/open"):
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw.decode("utf-8"))
        except Exception:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"bad json"}')
            return

        file_id = req.get("file_id") or ""
        filename = req.get("filename") or "file"
        download_url = req.get("download_url") or ""
        token = req.get("token")
        api_base = req.get("api_base") or "http://localhost:8000"
        mime = req.get("mime")
        watch = bool(req.get("watch", True))

        if not file_id or not download_url:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"missing file_id or download_url"}')
            return

        # cache path
        safe = filename.replace("\\", "/").split("/")[-1]
        local_dir = os.path.join(CACHE_ROOT, file_id)
        local_path = os.path.join(local_dir, safe)

        try:
            _download(download_url, local_path)
            _open_default(local_path)

            if watch and token:
                t = threading.Thread(
                    target=_watch_and_upload,
                    kwargs=dict(api_base=api_base, token=token, file_id=file_id, filename=safe, mime=mime, local_path=local_path),
                    daemon=True,
                )
                t.start()

            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            out = {"ok": True, "path": local_path, "watching": bool(watch and token)}
            self.wfile.write(json.dumps(out).encode("utf-8"))
        except HTTPError as e:
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"download failed: {e.code}"}).encode("utf-8"))
        except URLError as e:
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"network: {e}"}).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

def main():
    print(f"Open Helper listening on http://{HOST}:{PORT}")
    print(f"Cache: {CACHE_ROOT}")
    HTTPServer((HOST, PORT), Handler).serve_forever()

if __name__ == "__main__":
    main()
