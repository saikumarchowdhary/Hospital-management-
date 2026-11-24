import { api } from '../api.js';
import { closeModal, emptyState, errorState, esc, fmtDate, fmtMoney, openModal, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderFinancePage(container, user) {
  container.innerHTML = skeletonBlock(4);
  try {
    const isPatient = user.role === 'patient';
    const invRes = await api.get('/api/billing/invoices');
    const ledger = isPatient ? null : await api.get('/api/billing/ledger').catch(() => null);

    container.innerHTML = `
      ${ledger ? `
        <div class="kpi-grid">
          <div class="kpi-card"><span class="kpi-label">Total Invoiced</span><span class="kpi-value tabular">${fmtMoney(ledger.totals.totalInvoiced)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Collected (Demo)</span><span class="kpi-value tabular" style="color:var(--success)">${fmtMoney(ledger.totals.totalCollected)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Outstanding Balance</span><span class="kpi-value tabular" style="color:var(--warning)">${fmtMoney(ledger.totals.totalOutstanding)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Hospital Expenses</span><span class="kpi-value tabular">${fmtMoney(ledger.totals.totalExpenses)}</span></div>
          <div class="kpi-card"><span class="kpi-label">Refunds</span><span class="kpi-value tabular">${fmtMoney(ledger.totals.totalRefunds)}</span></div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <div>
            <h1>${isPatient ? 'Bills & Simulated Payments' : 'Hospital Billing & Finance'}</h1>
            <p class="text-sm muted">Local demonstration payment mode — no real payment gateway or card processing is connected.</p>
          </div>
          ${!isPatient ? '<button class="btn btn-primary btn-sm" id="fin-exp-btn">+ Record Expense</button>' : ''}
        </div>
        ${invRes.invoices.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>Invoice #</th>${isPatient ? '' : '<th>Patient</th>'}<th>Description</th><th>Total</th><th>Paid</th><th>Balance Due</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              ${invRes.invoices.map((inv) => `
                <tr>
                  <td class="mono">${esc(inv.invoice_number)}<div class="text-xs muted tabular">${fmtDate(inv.created_at)}</div></td>
                  ${isPatient ? '' : `<td><strong>${esc(inv.patient_name)}</strong><div class="text-xs muted mono">${esc(inv.patient_code)}</div></td>`}
                  <td>
                    <div>${esc(inv.description)}</div>
                    <div class="text-xs muted tabular">Consult ${fmtMoney(inv.consultation_charges)} · Lab ${fmtMoney(inv.lab_charges)} · Rx ${fmtMoney(inv.pharmacy_charges)} · Tax ${fmtMoney(inv.tax)}</div>
                  </td>
                  <td class="num">${fmtMoney(inv.total_amount)}</td>
                  <td class="num">${fmtMoney(inv.paid_amount)}</td>
                  <td class="num"><strong>${fmtMoney(inv.balance_due)}</strong></td>
                  <td>${statusBadge(inv.status)}</td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      ${inv.balance_due > 0 && inv.status !== 'Cancelled' ? `<button class="btn btn-primary btn-sm pay-inv-btn" data-id="${inv.id}" data-num="${esc(inv.invoice_number)}" data-bal="${inv.balance_due}">Pay (Demo)</button>` : ''}
                      ${inv.payments.length ? `<button class="btn btn-sm rcpt-btn" data-id="${inv.id}">Receipt</button>` : ''}
                      ${!isPatient && inv.payments.some((p) => p.status === 'Paid') ? `<button class="btn btn-sm refund-btn" data-pay="${inv.payments.find((p) => p.status === 'Paid').id}">Refund</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>
        ` : emptyState('No invoices found', 'Invoices from consultations, lab orders, or pharmacy dispensing appear here.')}
      </div>
    `;

    container.querySelectorAll('.pay-inv-btn').forEach((b) => {
      b.onclick = () => {
        openModal(`Record Simulated Payment — ${b.dataset.num}`, `
          <div class="alert-banner" style="margin-bottom:12px">Demonstration Payment Only: No real funds or card details are processed.</div>
          <form id="pay-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="py-amt">Payment Amount ($)</label><input id="py-amt" name="amount" type="number" step="0.01" max="${b.dataset.bal}" value="${b.dataset.bal}" required /></div>
            <div class="field"><label for="py-met">Demo Method</label><select id="py-met" name="method"><option>Demo Simulation Card</option><option>Demo Cash Counter</option><option>Demo UPI</option></select></div>
            <button type="submit" class="btn btn-primary">Confirm Demo Payment</button>
          </form>
        `, (body) => {
          body.querySelector('#pay-form').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
              const res = await api.post('/api/billing/payments', {
                invoice_id: Number(b.dataset.id),
                amount: Number(fd.get('amount')),
                method: fd.get('method'),
                idempotency_key: `pay-${b.dataset.id}-${Date.now()}`
              });
              toast('Payment Recorded (Demo)', `Receipt ${res.payment.receipt_number} generated.`, 'success');
              closeModal();
              renderFinancePage(container, user);
            } catch (err) { toast('Payment Error', err.message, 'danger'); }
          };
        });
      };
    });

    container.querySelectorAll('.rcpt-btn').forEach((b) => {
      b.onclick = () => {
        const inv = invRes.invoices.find((i) => i.id === Number(b.dataset.id));
        const p = inv.payments[0];
        openModal(`Payment Receipt — ${p.receipt_number}`, `
          <div class="card" style="background:var(--bg)">
            <div class="meta-line"><span>Receipt #</span><strong class="mono">${esc(p.receipt_number)}</strong></div>
            <div class="meta-line" style="margin-top:6px"><span>Payment Ref:</span><span class="mono">${esc(p.payment_ref)}</span></div>
            <div class="meta-line" style="margin-top:6px"><span>Invoice:</span><span class="mono">${esc(inv.invoice_number)}</span></div>
            <div class="meta-line" style="margin-top:6px"><span>Amount Paid:</span><strong class="tabular">${fmtMoney(p.amount)}</strong></div>
            <div class="meta-line" style="margin-top:6px"><span>Method:</span><span>${esc(p.method)} (Simulated Local Mode)</span></div>
            <div class="meta-line" style="margin-top:6px"><span>Date:</span><span class="tabular">${fmtDate(p.paid_at)}</span></div>
          </div>
        `);
      };
    });

    container.querySelectorAll('.refund-btn').forEach((b) => {
      b.onclick = async () => {
        try {
          await api.post('/api/billing/refunds', { payment_id: Number(b.dataset.pay), reason: 'Accountant adjustment' });
          toast('Refund Processed', '', 'success');
          renderFinancePage(container, user);
        } catch (err) { toast('Refund Error', err.message, 'danger'); }
      };
    });

    const expBtn = container.querySelector('#fin-exp-btn');
    if (expBtn) {
      expBtn.onclick = () => {
        openModal('Record Hospital Expense', `
          <form id="exp-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="ex-cat">Category</label><select id="ex-cat" name="category"><option>Medical Supplies</option><option>Utilities</option><option>Equipment Maintenance</option></select></div>
            <div class="field"><label for="ex-desc">Description</label><input id="ex-desc" name="description" required /></div>
            <div class="field"><label for="ex-amt">Amount ($)</label><input id="ex-amt" name="amount" type="number" step="0.01" required /></div>
            <button type="submit" class="btn btn-primary">Save Expense</button>
          </form>
        `, (body) => {
          body.querySelector('#exp-form').onsubmit = async (e) => {
            e.preventDefault();
            await api.post('/api/billing/expenses', Object.fromEntries(new FormData(e.target).entries()));
            toast('Expense Recorded', '', 'success');
            closeModal();
            renderFinancePage(container, user);
          };
        });
      };
    }
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}
