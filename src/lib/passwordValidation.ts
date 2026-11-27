export interface PasswordEvaluation {
  password: string;
  hasMinLength: boolean;
  hasNumber: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasMixedCase: boolean;
  hasSpecial: boolean;
  hasExtendedLength: boolean;
  meetsRequirements: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Enter password' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  error: string | null;
}

export function isStrongPasswordClient(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && /\d/.test(password);
}

export function evaluatePasswordStrength(password: string): PasswordEvaluation {
  const pwd = typeof password === 'string' ? password : '';
  const hasMinLength = pwd.length >= 8;
  const hasNumber = /\d/.test(pwd);
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasMixedCase = hasUppercase && hasLowercase;
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const hasExtendedLength = pwd.length >= 12;
  const meetsRequirements = hasMinLength && hasNumber;

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  let label: PasswordEvaluation['label'] = 'Enter password';

  if (pwd.length > 0) {
    if (!meetsRequirements) {
      score = 1;
      label = 'Weak';
    } else {
      let bonus = 0;
      if (hasMixedCase) bonus += 1;
      if (hasSpecial || hasExtendedLength) bonus += 1;
      if (bonus === 0) {
        score = 2;
        label = 'Fair';
      } else if (bonus === 1) {
        score = 3;
        label = 'Good';
      } else {
        score = 4;
        label = 'Strong';
      }
    }
  }

  let error: string | null = null;
  if (pwd.length > 0 && !meetsRequirements) {
    if (!hasMinLength && !hasNumber) {
      error = 'Password must be at least 8 characters and include at least 1 number.';
    } else if (!hasMinLength) {
      error = 'Password must be at least 8 characters long.';
    } else {
      error = 'Password must include at least 1 number (0–9).';
    }
  }

  return {
    password: pwd,
    hasMinLength,
    hasNumber,
    hasUppercase,
    hasLowercase,
    hasMixedCase,
    hasSpecial,
    hasExtendedLength,
    meetsRequirements,
    score,
    label,
    error,
  };
}
