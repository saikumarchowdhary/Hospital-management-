import { api } from '../api.js';
import { emptyState, errorState, esc, fmtDate, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderSpecializationsDirectory(container, _user, navigate) {
  container.innerHTML = skeletonBlock(4);
  try {
    const meta = await api.get('/api/doctors/meta/filters');
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h1>Medical Specializations Directory</h1>
            <p class="text-sm muted">Browse all ${meta.specialties.length} medical specialties and find an available specialist doctor.</p>
          </div>
          <button class="btn btn-sm" id="spec-all-docs">View All Doctors</button>
        </div>
        <div class="grid-3">
          ${meta.specialties.map((s, idx) => `
            <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:10px">
              <div>
                <div class="meta-line">
                  <span class="tabular muted">#${idx + 1}</span>
                  <span>·</span>
                  <span>${esc(s.department_name || 'Clinical')}</span>
                </div>
                <h3 style="margin:4px 0">${esc(s.name)}</h3>
                <p class="text-xs muted">${esc(s.description || 'Specialist hospital consultation and diagnostic care.')}</p>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border-subtle)">
                <span class="text-xs muted tabular">${s.doctor_count || 0} specialist(s)</span>
                <button class="btn btn-primary btn-sm spec-find-btn" data-id="${s.id}">Find Doctors</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    container.querySelector('#spec-all-docs').onclick = () => navigate('patient/doctors');
    container.querySelectorAll('.spec-find-btn').forEach((b) => {
      b.onclick = () => navigate(`patient/doctors?specialtyId=${b.dataset.id}`);
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export async function renderPatientDocuments(container, _user, navigate) {
  container.innerHTML = skeletonBlock(4);
  try {
    const res = await api.get('/api/patients/me/documents');
    container.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div><h1>Upload Medical Document</h1><p class="text-sm muted">Upload prior lab reports, prescriptions, imaging scans, or referral letters (PDF/PNG/JPG/TXT, max 5MB).</p></div>
          </div>
          <form id="pat-doc-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="pd-title">Document Title</label><input id="pd-title" name="title" required placeholder="e.g. Prior ECG Report - March 2026" /></div>
            <div class="field"><label for="pd-cat">Category</label>
              <select id="pd-cat" name="category">
                <option value="External Medical Report">External Medical Report</option>
                <option value="Previous Prescription">Previous Prescription</option>
                <option value="Imaging / Scan">Imaging / Scan</option>
                <option value="Discharge Summary">Prior Discharge Summary</option>
                <option value="Insurance Card / ID">Insurance / Identification</option>
              </select>
            </div>
            <div class="field"><label for="pd-file">Select File</label><input id="pd-file" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required /></div>
            <button type="submit" class="btn btn-primary">Upload to My Medical Vault</button>
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h2>My Uploaded Medical Documents (${res.documents.length})</h2>
            <button class="btn btn-sm" id="doc-rec-btn">Open Medical Records</button>
          </div>
          ${res.documents.length ? res.documents.map((d) => `
            <div class="list-row">
              <div>
                <strong>${esc(d.title)}</strong>
                <div class="meta-line"><span>${esc(d.category)}</span><span>·</span><span class="tabular">${fmtDate(d.created_at)}</span></div>
                ${d.original_name ? `<div class="text-xs muted">${esc(d.original_name)}</div>` : ''}
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                ${statusBadge(d.status)}
                ${d.attachment_id ? `<a class="btn btn-sm" href="/api/admin/attachments/${d.attachment_id}" target="_blank" rel="noopener">View File</a>` : ''}
              </div>
            </div>
          `).join('') : emptyState('No uploaded documents yet', 'Upload outside reports or prescriptions so your care team can review them.')}
        </div>
      </div>
    `;

    container.querySelector('#doc-rec-btn').onclick = () => navigate('patient/records');
    container.querySelector('#pat-doc-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/patients/me/documents', new FormData(e.target));
        toast('Document Uploaded', 'Saved securely to your medical vault.', 'success');
        renderPatientDocuments(container, _user, navigate);
      } catch (err) { toast('Upload Failed', err.message, 'danger'); }
    };
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}

export function renderPatientSupport(container, _user, navigate) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <h1>Patient Help & Support</h1>
          <p class="text-sm muted">24/7 hospital helpdesk, appointment assistance, and billing support.</p>
        </div>
        <button class="btn btn-sm" id="sup-home-btn">Back to Dashboard</button>
      </div>
      <div class="grid-3">
        <div class="card" style="background:var(--bg)">
          <h3>24/7 Triage & Emergency</h3>
          <p class="text-sm muted" style="margin:6px 0">Immediate medical assistance and ambulance dispatch.</p>
          <strong class="mono">+1-555-911-CARE</strong>
        </div>
        <div class="card" style="background:var(--bg)">
          <h3>Appointments Desk</h3>
          <p class="text-sm muted" style="margin:6px 0">Scheduling, rescheduling, and specialist referrals (Mon–Sat 07:00–21:00).</p>
          <strong class="mono">+1-555-800-0100</strong>
        </div>
        <div class="card" style="background:var(--bg)">
          <h3>Billing & Insurance Help</h3>
          <p class="text-sm muted" style="margin:6px 0">Invoice inquiries, itemized receipts, and TPA claims desk.</p>
          <strong class="mono">billing@medicore-hms.org</strong>
        </div>
      </div>
      <div style="margin-top:16px">
        <h3>Common Patient Actions</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary btn-sm" data-nav="patient/book">Book Doctor Visit</button>
          <button class="btn btn-sm" data-nav="patient/specialties">Explore Medical Specializations</button>
          <button class="btn btn-sm" data-nav="patient/documents">Upload Outside Records</button>
          <button class="btn btn-sm" data-nav="patient/payments">View Pending Invoices</button>
        </div>
      </div>
    </div>
  `;
  container.querySelector('#sup-home-btn').onclick = () => navigate('patient/home');
  container.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => navigate(b.dataset.nav); });
}
