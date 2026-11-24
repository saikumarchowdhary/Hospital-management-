import React, { useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, X } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface Props {
  open: boolean;
  initialFee?: number;
  onClose: () => void;
  onCompleted: () => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const DAY_CHOICES = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

export const DoctorScheduleWizardModal: React.FC<Props> = ({ open, initialFee = 100, onClose, onCompleted, onNotify }) => {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('14:00');
  const [fee, setFee] = useState(String(initialFee));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFee(String(initialFee || 100));
  }, [initialFee]);

  if (!open) return null;

  const toggleDay = (val: number) => {
    setDays((prev) => (prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!days.length) {
      onNotify('Select at least one working day.', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/doctors/me/schedule-setup', {
        method: 'PUT',
        body: {
          working_days: days,
          start_time: startTime,
          end_time: endTime,
          slot_minutes: slotMinutes,
          break_start: breakStart || null,
          break_end: breakEnd || null,
          consultation_fee: Number(fee || 100),
        },
      });
      onNotify('Schedule published! Patients can now discover and book you in Find Doctors.', 'success');
      onCompleted();
    } catch (err: any) {
      onNotify(err.message || 'Schedule setup failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold mb-1">
              First-Login Schedule Setup
            </span>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" /> Configure Your Clinical Schedule
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set your working days, hours, breaks, and slot duration to appear in Find Doctors.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Working Days</label>
          <div className="flex flex-wrap gap-2">
            {DAY_CHOICES.map((d) => {
              const active = days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Shift Start</label>
            <input required type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Shift End</label>
            <input required type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Slot Length</label>
            <select value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm">
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>{m} minutes</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Consultation Fee ($)</label>
            <input required type="number" min={10} value={fee} onChange={(e) => setFee(e.target.value)} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Break Start (Optional)</label>
            <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Break End (Optional)</label>
            <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm" />
          </div>
        </div>

        <button
          disabled={saving}
          type="submit"
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2"
        >
          <Clock className="w-4 h-4" />
          <CheckCircle2 className="w-4 h-4" />
          <span>{saving ? 'Publishing Schedule...' : 'Save Schedule & Go Live'}</span>
        </button>
      </form>
    </div>
  );
};
