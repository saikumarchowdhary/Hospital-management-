import express from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { getUserNotifications, markAllRead, markNotificationRead } from '../services/notifications.js';

export function createNotificationsRouter(db, broker, authenticate) {
  const router = express.Router();

  router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
    res.json(getUserNotifications(db, req.user));
  }));

  router.post('/notifications/:id/read', authenticate, asyncHandler(async (req, res) => {
    markNotificationRead(db, Number(req.params.id), req.user.id);
    res.json({ ok: true });
  }));

  router.post('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
    markAllRead(db, req.user);
    res.json({ ok: true });
  }));

  router.get('/events/stream', authenticate, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const lastId = req.headers['last-event-id'] || req.query.lastEventId;
    if (lastId) {
      const missed = broker.getMissedEvents(lastId, req.user);
      for (const ev of missed) {
        res.write(`id: ${ev.id}\nevent: ${ev.event_type}\ndata: ${ev.payload_json}\n\n`);
      }
    }

    const client = broker.addClient(res, req.user);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      broker.removeClient(client);
    });
  });

  return router;
}
