import express from 'express';
import { AppError, asyncHandler } from '../middleware/errors.js';
import { requireRole } from '../middleware/roles.js';
import {
  getIntegrationsStatus,
  processPaymentWebhookTx,
  sendIntegrationMessage
} from '../services/integrations.js';

export function createIntegrationsRouter(db, broker, authenticate) {
  const router = express.Router();

  // Public/provider-signed payment webhook endpoint (authenticated via HMAC signature, not user session)
  router.post('/webhooks/payment', asyncHandler(async (req, res) => {
    const signature = req.headers['x-webhook-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const isSandboxHeader = req.headers['x-sandbox-mode'] === 'true';
    const sandboxSecret = isSandboxHeader ? (process.env.SANDBOX_WEBHOOK_SECRET || 'medicore-sandbox-webhook-key') : null;
    const result = processPaymentWebhookTx(db, broker, {
      rawBody,
      signature,
      event: req.body,
      sandboxSecret
    });
    res.status(200).json(result);
  }));

  router.use(authenticate);

  router.get('/status', requireRole('admin', 'accountant', 'receptionist'), asyncHandler(async (_req, res) => {
    const status = getIntegrationsStatus();
    const recentDeliveries = db.all('SELECT * FROM integration_deliveries ORDER BY id DESC LIMIT 30');
    const recentWebhooks = db.all('SELECT id, provider, event_id, event_type, signature_valid, status, processed_at FROM webhook_events ORDER BY id DESC LIMIT 30');
    res.json({ status, recentDeliveries, recentWebhooks });
  }));

  router.post('/notify/test', requireRole('admin', 'receptionist', 'doctor'), asyncHandler(async (req, res) => {
    const { channel, recipient, subject = '', message, sandbox = true } = req.body || {};
    if (sandbox === false && req.user.role !== 'admin') {
      throw new AppError(403, 'Only administrators can invoke live mode deliveries.');
    }
    const delivery = sendIntegrationMessage(db, {
      channel,
      recipient,
      subject,
      message,
      actor: req.user,
      sandbox: sandbox !== false
    });
    res.status(201).json({ delivery });
  }));

  return router;
}
