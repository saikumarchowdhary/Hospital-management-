import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BedDouble, Building2, Printer, Search, CheckSquare, Square, QrCode, X, Download } from 'lucide-react';

export interface BedLabelRecord {
  id: number;
  code: string;
  ward: string;
  room: string;
  type: string;
  status: string;
  patient: string | null;
  patient_code?: string | null;
  admission_ref?: string | null;
  department_name?: string | null;
}

export interface DepartmentLabelRecord {
  id: number;
  code: string;
  name: string;
  category?: string;
  branch_name?: string;
  head_name?: string | null;
  head_user_code?: string | null;
  employee_count?: number;
  doctor_count?: number;
  is_active?: number | boolean;
}

interface Props {
  beds: BedLabelRecord[];
  departments: DepartmentLabelRecord[];
  compact?: boolean;
  onOpenFullPage?: () => void;
  onNotify?: (msg: string, tone?: 'success' | 'error') => void;
}

type LabelMode = 'beds' | 'departments';

interface PrintableLabelItem {
  key: string;
  kind: 'BED ASSIGNMENT' | 'DEPARTMENT LABEL';
  title: string;
  subtitle: string;
  metaLines: string[];
  badge: string;
  qrValue: string;
}

export const AdminQrLabelsPanel: React.FC<Props> = ({
  beds,
  departments,
  compact = false,
  onOpenFullPage,
  onNotify,
}) => {
  const [mode, setMode] = useState<LabelMode>('beds');
  const [search, setSearch] = useState('');
  const [bedStatusFilter, setBedStatusFilter] = useState<'All' | 'Occupied' | 'Available'>('All');
  const [selectedBedIds, setSelectedBedIds] = useState<number[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>([]);
  const [printPreviewItems, setPrintPreviewItems] = useState<PrintableLabelItem[] | null>(null);

  const filteredBeds = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (beds || []).filter((b) => {
      const matchesStatus = bedStatusFilter === 'All' || b.status === bedStatusFilter;
      const matchesSearch =
        !q ||
        String(b.code || '').toLowerCase().includes(q) ||
        String(b.ward || '').toLowerCase().includes(q) ||
        String(b.room || '').toLowerCase().includes(q) ||
        String(b.patient || '').toLowerCase().includes(q) ||
        String(b.patient_code || '').toLowerCase().includes(q) ||
        String(b.admission_ref || '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [beds, search, bedStatusFilter]);

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (departments || []).filter((d) => {
      return (
        !q ||
        String(d.code || '').toLowerCase().includes(q) ||
        String(d.name || '').toLowerCase().includes(q) ||
        String(d.category || '').toLowerCase().includes(q) ||
        String(d.branch_name || '').toLowerCase().includes(q)
      );
    });
  }, [departments, search]);

  const displayedBeds = compact ? filteredBeds.slice(0, 6) : filteredBeds;
  const displayedDepartments = compact ? filteredDepartments.slice(0, 6) : filteredDepartments;

  const toBedLabelItem = (b: BedLabelRecord): PrintableLabelItem => {
    const payload = JSON.stringify({
      type: 'HMS_BED_ASSIGNMENT',
      bed: b.code,
      ward: b.ward,
      room: b.room,
      status: b.status,
      patient: b.patient || 'Unassigned',
      patient_code: b.patient_code || null,
      admission_ref: b.admission_ref || null,
      department: b.department_name || null,
    });
    return {
      key: `bed-${b.id}`,
      kind: 'BED ASSIGNMENT',
      title: `${b.code} · Room ${b.room}`,
      subtitle: `${b.ward} (${b.type})`,
      metaLines: [
        b.patient ? `Patient: ${b.patient}${b.patient_code ? ` (${b.patient_code})` : ''}` : 'Patient: Unassigned',
        b.admission_ref ? `Admission: ${b.admission_ref}${b.department_name ? ` · ${b.department_name}` : ''}` : `Status: ${b.status}`,
      ],
      badge: b.status,
      qrValue: payload,
    };
  };

  const toDeptLabelItem = (d: DepartmentLabelRecord): PrintableLabelItem => {
    const payload = JSON.stringify({
      type: 'HMS_DEPARTMENT_LABEL',
      code: d.code,
      name: d.name,
      category: d.category || 'clinical',
      branch: d.branch_name || 'Main Campus',
      head: d.head_name || 'Unassigned',
    });
    return {
      key: `dept-${d.id}`,
      kind: 'DEPARTMENT LABEL',
      title: `${d.code} — ${d.name}`,
      subtitle: `${(d.category || 'clinical').toUpperCase()} · ${d.branch_name || 'Main Campus'}`,
      metaLines: [
        `Head: ${d.head_name || 'Unassigned'}`,
        `Staff: ${d.employee_count ?? 0} · Doctors: ${d.doctor_count ?? 0}`,
      ],
      badge: d.is_active === 0 || d.is_active === false ? 'Inactive' : 'Active',
      qrValue: payload,
    };
  };

  const toggleBedSelection = (id: number) => {
    setSelectedBedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleDeptSelection = (id: number) => {
    setSelectedDeptIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleOpenSelectedPrintSheet = () => {
    if (mode === 'beds') {
      const chosen = beds.filter((b) => selectedBedIds.includes(b.id));
      const targets = chosen.length > 0 ? chosen : displayedBeds;
      if (targets.length === 0) {
        onNotify?.('No beds available to generate QR labels.', 'error');
        return;
      }
      setPrintPreviewItems(targets.map(toBedLabelItem));
    } else {
      const chosen = departments.filter((d) => selectedDeptIds.includes(d.id));
      const targets = chosen.length > 0 ? chosen : displayedDepartments;
      if (targets.length === 0) {
        onNotify?.('No departments available to generate QR labels.', 'error');
        return;
      }
      setPrintPreviewItems(targets.map(toDeptLabelItem));
    }
  };

  const triggerBrowserPrint = () => {
    document.body.classList.add('qr-print-mode');
    const cleanup = () => {
      document.body.classList.remove('qr-print-mode');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
    } finally {
      setTimeout(cleanup, 600);
    }
  };

  const handleDownloadSingleSvg = (elementId: string, filename: string) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const svgXml = new XMLSerializer().serializeToString(el);
    const blob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify?.(`Downloaded ${filename}.svg`, 'success');
  };

  const activeSelectionCount = mode === 'beds' ? selectedBedIds.length : selectedDeptIds.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">
              Printable QR Labels — Bed Assignments &amp; Departments
            </h3>
            <p className="text-xs text-slate-500">
              Generate scannable QR codes for bedside patient tags and hospital department signage
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('beds');
                setSearch('');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1.5 ${
                mode === 'beds' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span>Bed Assignments ({beds.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('departments');
                setSearch('');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold inline-flex items-center gap-1.5 ${
                mode === 'departments' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Department Labels ({departments.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenSelectedPrintSheet}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>
              {activeSelectionCount > 0 ? `Print Selected (${activeSelectionCount})` : 'Print Preview Sheet'}
            </span>
          </button>

          {compact && onOpenFullPage && (
            <button
              type="button"
              onClick={onOpenFullPage}
              className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold"
            >
              Open Full Studio
            </button>
          )}
        </div>
      </div>

      {/* Filter & Bulk Selection Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                mode === 'beds'
                  ? 'Search bed code, ward, patient name, or admission ref...'
                  : 'Search department code, name, category, or branch...'
              }
              className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-xl"
            />
          </div>
          {mode === 'beds' && (
            <select
              value={bedStatusFilter}
              onChange={(e) => setBedStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-100 rounded-xl font-semibold text-slate-700"
            >
              <option value="All">All Bed Statuses</option>
              <option value="Occupied">Occupied (Assigned)</option>
              <option value="Available">Available</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'beds' ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedBedIds(filteredBeds.filter((b) => b.status === 'Occupied').map((b) => b.id))}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-semibold"
              >
                Select Occupied
              </button>
              <button
                type="button"
                onClick={() => setSelectedBedIds(filteredBeds.map((b) => b.id))}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Select All
              </button>
              {selectedBedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedBedIds([])}
                  className="px-2.5 py-1.5 text-rose-600 font-semibold"
                >
                  Clear ({selectedBedIds.length})
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelectedDeptIds(filteredDepartments.map((d) => d.id))}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
              >
                Select All
              </button>
              {selectedDeptIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDeptIds([])}
                  className="px-2.5 py-1.5 text-rose-600 font-semibold"
                >
                  Clear ({selectedDeptIds.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* QR Cards Grid */}
      {mode === 'beds' ? (
        displayedBeds.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No hospital beds match the current filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayedBeds.map((b) => {
              const item = toBedLabelItem(b);
              const isSelected = selectedBedIds.includes(b.id);
              const svgId = `qr-svg-bed-${b.id}`;
              return (
                <div
                  key={b.id}
                  className={`p-4 rounded-2xl border transition-all flex items-start gap-4 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/40 shadow-xs'
                      : 'border-slate-200/80 bg-slate-50/60 hover:bg-white'
                  }`}
                >
                  <div className="bg-white p-2 rounded-xl border border-slate-200 shrink-0">
                    <QRCodeSVG id={svgId} value={item.qrValue} size={92} level="M" includeMargin={false} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                          {item.kind}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 truncate">{item.title}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBedSelection(b.id)}
                        className="text-slate-500 hover:text-blue-600 p-0.5"
                        aria-label={`Select ${b.code}`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-slate-600 truncate">{item.subtitle}</p>
                    <div className="space-y-0.5 text-[11px] text-slate-700">
                      {item.metaLines.map((line, i) => (
                        <div key={i} className="truncate font-medium">{line}</div>
                      ))}
                    </div>
                    <div className="pt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintPreviewItems([item])}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3" /> Print Label
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingleSvg(svgId, `Bed_${b.code}_QR`)}
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> SVG
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : displayedDepartments.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
          No departments match the current search.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayedDepartments.map((d) => {
            const item = toDeptLabelItem(d);
            const isSelected = selectedDeptIds.includes(d.id);
            const svgId = `qr-svg-dept-${d.id}`;
            return (
              <div
                key={d.id}
                className={`p-4 rounded-2xl border transition-all flex items-start gap-4 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200/80 bg-slate-50/60 hover:bg-white'
                }`}
              >
                <div className="bg-white p-2 rounded-xl border border-slate-200 shrink-0">
                  <QRCodeSVG id={svgId} value={item.qrValue} size={92} level="M" includeMargin={false} />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        {item.kind}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 truncate">{item.title}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDeptSelection(d.id)}
                      className="text-slate-500 hover:text-indigo-600 p-0.5 shrink-0"
                      aria-label={`Select ${d.name}`}
                    >
                      {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-slate-600 truncate">{item.subtitle}</p>
                  <div className="space-y-0.5 text-[11px] text-slate-700">
                    {item.metaLines.map((line, i) => (
                      <div key={i} className="truncate font-medium">{line}</div>
                    ))}
                  </div>
                  <div className="pt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPrintPreviewItems([item])}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <Printer className="w-3 h-3" /> Print Label
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleSvg(svgId, `Dept_${d.code}_QR`)}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> SVG
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Printable Label Sheet Preview Modal */}
      {printPreviewItems && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Printable QR Label Sheet ({printPreviewItems.length} {printPreviewItems.length === 1 ? 'label' : 'labels'})
                </h3>
                <p className="text-xs text-slate-500">Formatted for thermal badge printers or A4/Letter label sheets</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerBrowserPrint}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintPreviewItems(null)}
                  className="p-2 text-slate-500 hover:bg-slate-200 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 bg-slate-100">
              <div id="qr-print-sheet" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {printPreviewItems.map((item) => (
                  <div
                    key={item.key}
                    className="bg-white border-2 border-slate-800 rounded-xl p-4 flex items-center gap-4 break-inside-avoid"
                  >
                    <div className="p-1.5 border border-slate-200 rounded-lg bg-white shrink-0">
                      <QRCodeSVG value={item.qrValue} size={116} level="M" includeMargin={false} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                          CareLine HMS · {item.kind}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 border border-slate-300 rounded text-slate-700">
                          {item.badge}
                        </span>
                      </div>
                      <h4 className="font-bold text-base text-slate-900 leading-tight">{item.title}</h4>
                      <p className="text-xs font-semibold text-slate-600">{item.subtitle}</p>
                      <div className="pt-1 border-t border-slate-200 space-y-0.5 text-xs text-slate-800">
                        {item.metaLines.map((line, idx) => (
                          <div key={idx} className="truncate">{line}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
