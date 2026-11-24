import crypto from 'node:crypto';
import { AppError } from '../middleware/errors.js';
import { logAudit } from './audit.js';
import { recordPaymentTx } from './billing.js';

export function getIntegrationsStatus() {
  const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY);
  const hasWebhookSecret = Boolean(process.env.PAYMENT_WEBHOOK_SECRET);
  const hasTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
  const hasEmail = Boolean(process.env.SENDGRID_API_KEY || process.env.SMTP_HOST);
  const hasWhatsapp = Boolean(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasPacs = Boolean(process.env.PACS_DICOMWEB_URL);
  const hasFhir = Boolean(process.env.FHIR_BASE_URL);
  const hasMaps = Boolean(process.env.GOOGLE_MAPS_API_KEY);

  return {
    paymentGateway: { status: hasStripe ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: true },
    paymentWebhook: { status: hasWebhookSecret ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: true },
    sms: { status: hasTwilio ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: true },
    email: { status: hasEmail ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: true },
    whatsapp: { status: hasWhatsapp ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: true },
    pacsDicom: { status: hasPacs ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: false },
    hl7Fhir: { status: hasFhir ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: false },
    mapsAmbulance: { status: hasMaps ? 'CONFIGURED' : 'NOT CONFIGURED', sandboxSupported: false }
  };
}

export function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = String(signatureHeader).replace(/^sha256=/, '').trim();
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(provided, 'utf8'));
}

export function processPaymentWebhookTx(db, broker, { rawBody, signature, event, sandboxSecret = null }) {
  const configuredSecret = process.env.PAYMENT_WEBHOOK_SECRET || sandboxSecret;
  if (!configuredSecret) {
    throw new AppError(503, 'Payment webhook secret is NOT CONFIGURED on server.');
  }
  if (!verifyWebhookSignature(rawBody, signature, configuredSecret)) {
    throw new AppError(401, 'Invalid payment webhook signature.');
  }
  if (!event || !event.id || !event.type) {
    throw new AppError(400, 'Malformed webhook event payload (id and type required).');
  }

  return db.transaction(() => {
    const existing = db.get('SELECT * FROM webhook_events WHERE event_id = ?', [String(event.id)]);
    if (existing) {
      return { ok: true, duplicate: true, eventId: event.id, status: existing.status };
    }

    let processingResult = { reconciled: false };
    if (event.type === 'payment.succeeded' && event.data && event.data.invoice_id && event.data.amount) {
      const systemActor = db.get("SELECT u.id, r.code as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'admin' ORDER BY u.id LIMIT 1");
      processingResult = recordPaymentTx(db, broker, {
        invoiceId: Number(event.data.invoice_id),
        amount: Number(event.data.amount),
        method: event.data.method || (process.env.PAYMENT_WEBHOOK_SECRET ? 'Gateway Webhook' : 'Sandbox Webhook'),
        idempotencyKey: `wh-${event.id}`,
        actor: systemActor || { id: 1, role: 'admin' }
      });
    }

    db.run(
      `INSERT INTO webhook_events (provider, event_id, event_type, signature_valid, payload_json, status)
       VALUES (?, ?, ?, 1, ?, 'Processed')`,
      [event.provider || 'stripe_sandbox', String(event.id), String(event.type), JSON.stringify(event)]
    );

    logAudit(db, {
      actorUserId: null,
      actorRole: 'webhook',
      action: 'integration.payment_webhook_processed',
      entityType: 'webhook_event',
      entityId: String(event.id),
      details: JSON.stringify({ type: event.type, mode: process.env.PAYMENT_WEBHOOK_SECRET ? 'Live' : 'Sandbox' })
    });

    return { ok: true, duplicate: false, eventId: event.id, mode: process.env.PAYMENT_WEBHOOK_SECRET ? 'Live' : 'Sandbox', processingResult };
  })();
}

export function sendIntegrationMessage(db, { channel, recipient, subject = '', message, actor, sandbox = true }) {
  const normalized = String(channel || '').toLowerCase();
  if (!['sms', 'email', 'whatsapp'].includes(normalized)) {
    throw new AppError(400, 'Unsupported channel. Allowed: sms, email, whatsapp.');
  }
  if (!recipient || !String(recipient).trim()) {
    throw new AppError(400, 'Recipient is required.');
  }
  if (!message || !String(message).trim()) {
    throw new AppError(400, 'Message body is required.');
  }
  if (normalized === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient).trim())) {
    throw new AppError(400, 'Valid recipient email address is required.');
  }
  if ((normalized === 'sms' || normalized === 'whatsapp') && String(recipient).replace(/[^0-9+]/g, '').length < 7) {
    throw new AppError(400, 'Valid recipient phone number is required.');
  }

  const statuses = getIntegrationsStatus();
  const isLiveConfigured = statuses[normalized]?.status === 'CONFIGURED';

  if (!isLiveConfigured && !sandbox) {
    db.run(
      `INSERT INTO integration_deliveries (channel, recipient, subject, message, mode, status, error_message, actor_user_id)
       VALUES (?, ?, ?, ?, 'Live', 'Blocked - Not Configured', ?, ?)`,
      [normalized, recipient.trim(), subject, message.trim(), `${normalized.toUpperCase()} credentials NOT CONFIGURED`, actor?.id || null]
    );
    throw new AppError(503, `${normalized.toUpperCase()} live credentials are NOT CONFIGURED.`);
  }

  const mode = isLiveConfigured && !sandbox ? 'Live' : 'Sandbox';
  const ref = `SBX-${normalized.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const info = db.run(
    `INSERT INTO integration_deliveries (channel, recipient, subject, message, mode, status, provider_ref, actor_user_id)
     VALUES (?, ?, ?, ?, ?, 'Delivered (Sandbox)', ?, ?)`,
    [normalized, recipient.trim(), subject || null, message.trim(), mode, ref, actor?.id || null]
  );

  return db.get('SELECT * FROM integration_deliveries WHERE id = ?', [info.lastInsertRowid]);
}
