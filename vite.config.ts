import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const REPLAYS_DIR = path.resolve(__dirname, 'replays');
const LEVELS_DIR = path.resolve(__dirname, 'public/levels');

function replayPlugin(): Plugin {
  return {
    name: 'replay-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/save-replay' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', () => {
            try {
              const replay = JSON.parse(body);
              fs.mkdirSync(REPLAYS_DIR, { recursive: true });
              const now = new Date();
              const ts = now.toISOString()
                .replace(/T/, '_')
                .replace(/:/g, '-')
                .replace(/\..+/, '');
              const filename = `replay_${ts}_${replay.type}.json`;
              const filePath = path.join(REPLAYS_DIR, filename);
              fs.writeFileSync(filePath, JSON.stringify(replay, null, 2));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ filename }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        if (req.url === '/api/replays' && req.method === 'GET') {
          try {
            fs.mkdirSync(REPLAYS_DIR, { recursive: true });
            const files = fs.readdirSync(REPLAYS_DIR)
              .filter(f => f.endsWith('.json'))
              .sort()
              .reverse();
            const infos = files.map(f => {
              // Parse: replay_2026-02-07_14-30-45_full.json
              const match = f.match(/^replay_(.+)_(full|ring)\.json$/);
              return {
                filename: f,
                type: match?.[2] ?? 'unknown',
                timestamp: match?.[1]?.replace(/_/, 'T').replace(/-/g, ':') ?? '',
              };
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(infos));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
          }
          return;
        }

        const replayMatch = req.url?.match(/^\/api\/replays\/(.+)$/);
        if (replayMatch && req.method === 'GET') {
          const filename = decodeURIComponent(replayMatch[1]);
          const filePath = path.join(REPLAYS_DIR, path.basename(filename));
          try {
            const data = fs.readFileSync(filePath, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
          } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
          }
          return;
        }

        next();
      });
    },
  };
}

function levelPlugin(): Plugin {
  return {
    name: 'level-server',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/levels' && req.method === 'GET') {
          try {
            fs.mkdirSync(LEVELS_DIR, { recursive: true });
            const files = fs.readdirSync(LEVELS_DIR)
              .filter(f => f.endsWith('.json') || f.endsWith('.glb'))
              .sort();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('[]');
          }
          return;
        }

        const levelMatch = req.url?.match(/^\/api\/levels\/(.+)$/);
        if (levelMatch && req.method === 'GET') {
          const filename = decodeURIComponent(levelMatch[1]);
          const filePath = path.join(LEVELS_DIR, path.basename(filename));
          try {
            if (filename.endsWith('.glb')) {
              const data = fs.readFileSync(filePath);
              res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
              res.end(data);
            } else {
              const data = fs.readFileSync(filePath, 'utf-8');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(data);
            }
          } catch {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
          }
          return;
        }

        if (levelMatch && req.method === 'PUT') {
          const filename = decodeURIComponent(levelMatch[1]);
          const filePath = path.join(LEVELS_DIR, path.basename(filename));
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', () => {
            try {
              const json = JSON.parse(body);
              fs.mkdirSync(LEVELS_DIR, { recursive: true });
              fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [replayPlugin(), levelPlugin()],
});
