import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('out');
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (path !== root && !path.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const content = await readFile(path);
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(Number(process.env.PORT || 3000), '127.0.0.1', () =>
    console.log('Crease production preview: http://127.0.0.1:3000'),
  );
