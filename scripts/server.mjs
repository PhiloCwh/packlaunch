import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ethersBrowser = path.resolve(path.dirname(require.resolve('ethers')), '../dist/ethers.min.js');
const configDirectory = process.env.PACKLAUNCH_FRONTEND_CONFIG || 'public';
const routes = {
  '/': ['public/index.html', 'text/html'],
  '/apps/packlaunch': ['public/index.html', 'text/html'],
  '/app.js': ['public/app.js', 'application/javascript'],
  '/style.css': ['public/style.css', 'text/css'],
  '/deployment.json': [configDirectory + '/deployment.json', 'application/json'],
  '/abis.json': [configDirectory + '/abis.json', 'application/json'],
  '/ethers.js': [ethersBrowser, 'application/javascript']
};

export function serve(port = Number(process.env.APP_PORT || 4173)) {
  return http.createServer((req, res) => {
    const entry = routes[new URL(req.url, 'http://localhost').pathname];
    if (req.method !== 'GET' || !entry || !fs.existsSync(entry[0])) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': entry[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(entry[0]).pipe(res);
  }).listen(port, '127.0.0.1', () => console.log('PackLaunch: http://127.0.0.1:' + port));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) serve();
