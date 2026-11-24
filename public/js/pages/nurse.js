import { api } from '../api.js';
import { errorState, esc, fmtDate, skeletonBlock, statusBadge, toast } from '../ui.js';

export async function renderNursePortal(container) {
  container.innerHTML = skeletonBlock(4);
  try {
    const data = await api.get('/api/nursing/dashboard');
    const patients = [
      ...data.activeAdmissions.map((a) => ({ id: a.patient_id, label: `${a.patient_name} (${a.bed_code || 'IPD'})` })),
      ...data.checkedInPatients.map((c) => ({ id: c.patient_id, label: `${c.patient_name} (OPD Checked-In)` }))
    ];
    const uniquePatients = Array.from(new Map(patients.map((p) => [p.id, p])).values());

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card"><span class="kpi-label">Active Ward Patients</span><span class="kpi-value tabular">${data.activeAdmissions.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Checked-In OPD</span><span class="kpi-value tabular">${data.checkedInPatients.length}</span></div>
        <div class="kpi-card"><span class="kpi-label">Pending Care Tasks</span><span class="kpi-value tabular">${data.tasks.filter((t) => t.status === 'Pending').length}</span></div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Record Patient Vitals</h2></div>
          <form id="vitals-form" class="form-grid">
            <div class="field full"><label for="vt-pat">Patient</label>
              <select id="vt-pat" name="patient_id" required>
                ${uniquePatients.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('') || '<option value="">No active patients</option>'}
              </select>
            </div>
            <div class="field"><label for="vt-bp">Blood Pressure</label><input id="vt-bp" name="blood_pressure" required placeholder="120/80" /></div>
            <div class="field"><label for="vt-hr">Pulse (bpm)</label><input id="vt-hr" name="pulse" type="number" required value="76" /></div>
            <div class="field"><label for="vt-temp">Temperature (°C)</label><input id="vt-temp" name="temperature" type="number" step="0.1" required value="36.8" /></div>
            <div class="field"><label for="vt-rr">Respiratory Rate</label><input id="vt-rr" name="respiratory_rate" type="number" required value="16" /></div>
            <div class="field"><label for="vt-spo2">Oxygen Saturation (%)</label><input id="vt-spo2" name="oxygen_saturation" type="number" required value="98" /></div>
            <div class="field"><label for="vt-wt">Weight (kg)</label><input id="vt-wt" name="weight_kg" type="number" step="0.1" /></div>
            <div class="field full"><button type="submit" class="btn btn-primary">Save Vitals</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-header"><h2>Nursing Note & Medication Administration</h2></div>
          <form id="nurse-note-form" style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><label for="nn-pat">Patient</label>
              <select id="nn-pat" name="patient_id" required>
                ${uniquePatients.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label for="nn-obs">Clinical Observation</label><textarea id="nn-obs" name="observation" required placeholder="Patient comfort, wound check, response..."></textarea></div>
            <div class="field"><label for="nn-mar">Medication Administered (MAR - Optional)</label><input id="nn-mar" name="medication_administered" placeholder="e.g. Paracetamol 500mg oral at 14:00" /></div>
            <button type="submit" class="btn btn-primary">Record Nursing Note</button>
          </form>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Care Tasks</h2></div>
          ${data.tasks.map((t) => `
            <div class="list-row">
              <div><strong>${esc(t.patient_name)}</strong> · ${esc(t.task_type)}<div class="text-xs muted">${esc(t.description)}</div></div>
              ${t.status === 'Pending' ? `<button class="btn btn-sm complete-task-btn" data-id="${t.id}">Mark Done</button>` : statusBadge(t.status)}
            </div>
          `).join('')}
        </div>

        <div class="card">
          <div class="card-header"><h2>Recent Vitals & MAR Log</h2></div>
          ${data.recentVitals.slice(0, 6).map((v) => `
            <div class="list-row">
              <div><strong>${esc(v.patient_name)}</strong><div class="text-xs tabular muted">BP ${esc(v.blood_pressure)} · HR ${v.pulse} · SpO2 ${v.oxygen_saturation}% · ${v.temperature}°C</div></div>
              <span class="text-xs muted tabular">${fmtDate(v.created_at)}</span>
            </div>
          `).join('')}
          ${(data.notes || []).filter((n) => n.medication_administered).slice(0, 4).map((n) => `
            <div class="list-row">
              <div><strong style="color:var(--primary)">MAR: ${esc(n.patient_name)}</strong><div class="text-xs">${esc(n.medication_administered)}</div></div>
              <span class="text-xs muted tabular">${fmtDate(n.created_at)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Doctor Instructions & Active Treatment Plans</h2></div>
        ${(data.doctorInstructions || []).length ? data.doctorInstructions.map((ins) => `
          <div class="list-row">
            <div>
              <strong>${esc(ins.patient_name)}</strong> <span class="mono text-xs muted">(${esc(ins.patient_code)})</span> · Ordered by ${esc(ins.doctor_name)}
              <div class="text-sm" style="margin-top:2px">${esc(ins.treatment_plan)}</div>
            </div>
            <span class="text-xs muted tabular">${fmtDate(ins.created_at)}</span>
          </div>
        `).join('') : '<p class="text-sm muted">No active physician care instructions recorded yet.</p>'}
      </div>
    `;

    container.querySelector('#vitals-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.post('/api/nursing/vitals', Object.fromEntries(fd.entries()));
        toast('Vitals Recorded', 'Updated patient flowsheet.', 'success');
        renderNursePortal(container);
      } catch (err) { toast('Error', err.message, 'danger'); }
    };

    container.querySelector('#nurse-note-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api.post('/api/nursing/notes', Object.fromEntries(fd.entries()));
        toast('Note Saved', 'Nursing observation logged.', 'success');
        renderNursePortal(container);
      } catch (err) { toast('Error', err.message, 'danger'); }
    };

    container.querySelectorAll('.complete-task-btn').forEach((b) => {
      b.onclick = async () => {
        await api.patch(`/api/nursing/tasks/${b.dataset.id}/complete`, {});
        toast('Task Completed', '', 'success');
        renderNursePortal(container);
      };
    });
  } catch (err) {
    container.innerHTML = errorState(err.message);
  }
}
