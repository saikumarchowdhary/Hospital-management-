import { esc, toast } from './ui.js';

export function renderDemoAccountsPanel(groups, doctorSearch = '') {
  return `
    <div class="card" id="demo-accounts-card" style="max-height:85vh;display:flex;flex-direction:column">
      <div class="card-header" style="flex-shrink:0">
        <div>
          <h2>Demo Login Accounts (Grouped by Department)</h2>
          <p class="text-sm muted">Click any demo account to switch portal and fill credentials. Department doctors seeded for both branches.</p>
        </div>
      </div>

      <div style="overflow-y:auto;padding-right:6px;display:flex;flex-direction:column;gap:16px;flex:1">
        ${groups.map((group) => {
          let accounts = group.accounts || [];
          if (group.name === 'Doctors' && doctorSearch.trim()) {
            const q = doctorSearch.trim().toLowerCase();
            accounts = accounts.filter(
              (a) => a.name.toLowerCase().includes(q) ||
                     (a.department && a.department.toLowerCase().includes(q)) ||
                     (a.branch && a.branch.toLowerCase().includes(q)) ||
                     a.email.toLowerCase().includes(q)
            );
          }

          return `
            <div class="demo-group-box" style="border:1px solid var(--border);border-radius:8px;padding:12px;background:var(--bg)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <strong style="font-size:13.5px;color:var(--text)">${esc(group.name)}</strong>
                <span class="badge" style="font-size:11px">${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}</span>
              </div>

              ${group.hasSearch ? `
                <div style="margin-bottom:10px">
                  <input type="text" id="doctor-demo-search" placeholder="Search doctors by department or name..." value="${esc(doctorSearch)}"
                    style="width:100%;font-size:12.5px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg)" />
                </div>
              ` : ''}

              <div class="demo-grid" style="grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px">
                ${accounts.length === 0 ? `
                  <div class="text-xs muted" style="padding:8px">No doctors matched "${esc(doctorSearch)}".</div>
                ` : accounts.map((acc) => `
                  <button type="button" class="demo-card" data-role="${esc(acc.role)}" data-email="${esc(acc.email)}" data-pass="${esc(acc.password)}">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                      <span style="font-weight:600;color:var(--text)">${esc(acc.label || acc.role)}</span>
                      <span class="mono text-xs muted">${esc(acc.user_code || '')}</span>
                    </div>
                    <div class="text-xs muted">${esc(acc.name)}</div>
                    ${acc.reg_num ? `<div class="text-xs muted tabular" style="font-size:10.5px">Reg: ${esc(acc.reg_num)}</div>` : ''}
                    <div class="mono text-xs" style="color:var(--primary);margin-top:2px">${esc(acc.email)}</div>
                    <div class="text-xs muted tabular">Pass: ${esc(acc.password)}</div>
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

export function bindDemoAccountsEvents(root, onSelectAccount, onDoctorSearch) {
  const searchInput = root.querySelector('#doctor-demo-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      onDoctorSearch(e.target.value);
    };
  }

  root.querySelectorAll('#demo-accounts-card .demo-card[data-email]').forEach((btn) => {
    btn.onclick = () => {
      const email = btn.dataset.email;
      const pass = btn.dataset.pass;
      const role = btn.dataset.role;
      onSelectAccount(role, email, pass);
    };
  });
}
