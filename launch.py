"""Serve only this app on loopback and open the default browser. No dependencies.
Run: python launch.py
Stop: Ctrl+C, or close the launcher console.
"""
from __future__ import annotations
import argparse
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

APP = Path(__file__).resolve().with_name('Aggregation_Explorer.html')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        self._serve(head=False)
    def do_HEAD(self) -> None:
        self._serve(head=True)
    def _serve(self, head: bool) -> None:
        if urlsplit(self.path).path not in ('/', '/Aggregation_Explorer.html'):
            self.send_error(404, 'Only the Aggregation Explorer app is served.')
            return
        try:
            data = APP.read_bytes()
        except OSError as exc:
            self.send_error(500, str(exc))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        if not head:
            self.wfile.write(data)
    def log_message(self, format: str, *args: object) -> None:
        # No user content is logged; the app performs no uploads or API requests.
        return

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=0, help='Local port; 0 chooses a free port.')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not APP.is_file():
        raise SystemExit('Aggregation_Explorer.html is missing. Extract the complete ZIP first.')
    if not 0 <= args.port <= 65535:
        raise SystemExit('Port must be between 0 and 65535.')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as exc:
        raise SystemExit(f'Could not start the local server: {exc}') from exc
    server.daemon_threads = True
    url = f'http://127.0.0.1:{server.server_port}/Aggregation_Explorer.html'
    print('\nAggregation Explorer 0.1\n', flush=True)
    print(f'Open this address in your browser:\n  {url}\n', flush=True)
    print('This server is local to this computer. No packages or account are required.', flush=True)
    print('Keep this window open while using the app. Press Ctrl+C to stop.\n', flush=True)
    if not args.no_browser:
        threading.Timer(0.35, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
