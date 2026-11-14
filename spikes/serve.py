# Static server for the spikes with caching disabled, so edits always show on reload.
import functools, http.server, sys
class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=sys.argv[2] if len(sys.argv) > 2 else 'spikes')).serve_forever()
