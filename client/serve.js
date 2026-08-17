/** Minimal static file server with SPA history fallback. Avoids extra deps. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;

function send(res, status, body, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);

    if (!filePath.startsWith(DIST)) {
      send(res, 403, 'Forbidden');
      return;
    }

    fs.stat(filePath, (err) => {
      if (err) {
        // SPA fallback: serve index.html for client-side routes.
        fs.readFile(path.join(DIST, 'index.html'), (e, html) => {
          if (e) {
            send(res, 404, 'Not found');
          } else {
            send(res, 200, html, 'text/html');
          }
        });
        return;
      }
      fs.readFile(filePath, (e2, data) => {
        if (e2) {
          send(res, 500, 'Server error');
        } else {
          const ext = path.extname(filePath);
          const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
          send(res, 200, data, types[ext] || 'application/octet-stream');
        }
      });
    });
  })
  .listen(PORT, () => console.log(`📦 TaskFlow client serving on :${PORT}`));