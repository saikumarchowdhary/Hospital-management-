import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import { COOKIE_NAME, hydrateAuthenticatedUser } from '../middleware/auth.js';

function parseCookies(cookieHeader = '') {
  const out = {};
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function attachWebSocketServer(httpServer, db, jwtSecret, broker) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      let token = url.searchParams.get('token');
      if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.slice(7).trim();
      }
      if (!token && req.headers.cookie) {
        const cookies = parseCookies(req.headers.cookie);
        token = cookies[COOKIE_NAME];
      }
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const decoded = jwt.verify(token, jwtSecret);
      if (decoded.typ === 'refresh') {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const user = hydrateAuthenticatedUser(db, decoded.sub);
      if (!user || !user.is_active || user.account_status !== 'Active') {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, user);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, _req, user) => {
    const client = broker.addWsClient(ws, user);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ eventType: 'pong', ts: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed client frames
      }
    });
    ws.on('close', () => {
      broker.removeWsClient(client);
    });
    ws.on('error', () => {
      broker.removeWsClient(client);
    });
  });

  return wss;
}
