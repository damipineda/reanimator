// Minimal static file server, no new dependency (tech.md/rewriter.md's
// "no build step" ethos extends to the verifier's own tooling): serves one
// directory tree on one port, nothing else. Used to host the Ruffle
// harness page (original) and the rebuild's index.html for Playwright to
// navigate to, since both need real HTTP (fetch()) rather than file://.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.swf': 'application/x-shockwave-flash',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

export function startStaticServer(rootDir, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = path.join(rootDir, urlPath === '/' ? '/index.html' : urlPath);
    // Prevent path traversal outside rootDir.
    if (!filePath.startsWith(path.resolve(rootDir))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export function stopStaticServer(server) {
  return new Promise((resolve) => server.close(resolve));
}
