// Supabase Edge Function: Server-side Razorpay signature verification
// Deploy via: supabase functions deploy verify-razorpay-payment
// Required secrets: RAZORPAY_KEY_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  const expectedHex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Razorpay secret is not configured.' }), { status: 503 });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { bill_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
  if (!bill_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return new Response(JSON.stringify({ error: 'Missing Razorpay verification fields.' }), { status: 400 });
  }

  const { data: bill, error: fetchErr } = await supabaseAdmin
    .from('payments')
    .select('id, patient_id, status')
    .eq('id', bill_id)
    .single();

  if (fetchErr || !bill) {
    return new Response(JSON.stringify({ error: 'Bill not found.' }), { status: 404 });
  }
  if (bill.patient_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  if (bill.status === 'paid') {
    return new Response(JSON.stringify({ error: 'Bill is already paid.' }), { status: 409 });
  }

  const valid = await verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid Razorpay signature.' }), { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'paid',
      transaction_id: razorpay_payment_id,
      payment_method: 'Razorpay',
      paid_at: new Date().toISOString(),
    })
    .eq('id', bill_id)
    .select()
    .single();

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, payment: updated }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
