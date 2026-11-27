export function normalizePhone(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  let compact = input.replace(/[\s\-().]/g, '');
  if (compact.startsWith('00')) {
    compact = '+' + compact.slice(2);
  }
  const hasPlus = compact.startsWith('+');
  const digits = compact.replace(/\D/g, '');
  if (!digits) return '';

  if (hasPlus) {
    if (digits.startsWith('910') && digits.length === 13) {
      return `+91${digits.slice(3)}`;
    }
    return `+${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return digits;
}

export function getPhoneLookupCandidates(raw) {
  const norm = normalizePhone(raw);
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return [];
  const set = new Set();
  if (norm) set.add(norm);
  set.add(digits);
  if (digits.length === 10) {
    set.add(`+91${digits}`);
    set.add(`+1${digits}`);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    set.add(`+91${digits.slice(1)}`);
    set.add(digits.slice(1));
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    set.add(`+${digits}`);
    set.add(digits.slice(2));
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    set.add(`+${digits}`);
    set.add(digits.slice(1));
  }
  return Array.from(set);
}

export function classifyLoginIdentifier(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { kind: 'empty', value: '', candidates: [] };
  if (trimmed.includes('@')) {
    return { kind: 'email', value: trimmed.toLowerCase(), candidates: [] };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!/[a-zA-Z]/.test(trimmed) && digits.length >= 6) {
    return {
      kind: 'phone',
      value: normalizePhone(trimmed),
      candidates: getPhoneLookupCandidates(trimmed)
    };
  }
  return { kind: 'code', value: trimmed, candidates: [] };
}
