import React from 'react';
import { CheckCircle2, AlertCircle, Circle } from 'lucide-react';
import { evaluatePasswordStrength } from '../lib/passwordValidation';

interface PasswordStrengthMeterProps {
  password: string;
  confirmPassword?: string;
  currentPassword?: string;
  compact?: boolean;
}

const SCORE_BAR_COLORS: Record<number, string> = {
  0: 'bg-slate-200',
  1: 'bg-rose-500',
  2: 'bg-amber-500',
  3: 'bg-blue-500',
  4: 'bg-emerald-500',
};

const SCORE_TEXT_COLORS: Record<number, string> = {
  0: 'text-slate-500',
  1: 'text-rose-700',
  2: 'text-amber-700',
  3: 'text-blue-700',
  4: 'text-emerald-700',
};

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  confirmPassword,
  currentPassword,
  compact = false,
}) => {
  const evalResult = evaluatePasswordStrength(password);
  const hasTyped = password.length > 0;
  const hasTypedConfirm = typeof confirmPassword === 'string' && confirmPassword.length > 0;
  const passwordsMatch = hasTypedConfirm && password === confirmPassword;
  const sameAsCurrent =
    typeof currentPassword === 'string' &&
    currentPassword.length > 0 &&
    hasTyped &&
    password === currentPassword;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50/80 ${
        compact ? 'p-2.5 space-y-1.5' : 'p-3 space-y-2'
      }`}
      data-testid="password-strength-meter"
    >
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-600">Password Strength</span>
        <span
          className={`font-bold ${SCORE_TEXT_COLORS[evalResult.score]}`}
          data-testid="password-strength-label"
        >
          {evalResult.label}
        </span>
      </div>

      <div
        className="grid grid-cols-4 gap-1.5"
        role="progressbar"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={evalResult.score}
        aria-valuetext={evalResult.label}
      >
        {[1, 2, 3, 4].map((segment) => {
          const active = evalResult.score >= segment;
          return (
            <div
              key={segment}
              className={`h-1.5 rounded-full transition-colors duration-200 ${
                active ? SCORE_BAR_COLORS[evalResult.score] : 'bg-slate-200'
              }`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5 text-[11px]">
        <div
          className={`flex items-center gap-1.5 font-medium ${
            evalResult.hasMinLength
              ? 'text-emerald-700'
              : hasTyped
              ? 'text-rose-600'
              : 'text-slate-500'
          }`}
        >
          {evalResult.hasMinLength ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          ) : hasTyped ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
          ) : (
            <Circle className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          )}
          <span>At least 8 characters</span>
        </div>

        <div
          className={`flex items-center gap-1.5 font-medium ${
            evalResult.hasNumber
              ? 'text-emerald-700'
              : hasTyped
              ? 'text-rose-600'
              : 'text-slate-500'
          }`}
        >
          {evalResult.hasNumber ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          ) : hasTyped ? (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
          ) : (
            <Circle className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          )}
          <span>Contains at least 1 number</span>
        </div>

        {!compact && (
          <>
            <div
              className={`flex items-center gap-1.5 ${
                evalResult.hasMixedCase ? 'text-emerald-700 font-medium' : 'text-slate-500'
              }`}
            >
              {evalResult.hasMixedCase ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300" />
              )}
              <span>Upper &amp; lowercase (recommended)</span>
            </div>
            <div
              className={`flex items-center gap-1.5 ${
                evalResult.hasSpecial || evalResult.hasExtendedLength
                  ? 'text-emerald-700 font-medium'
                  : 'text-slate-500'
              }`}
            >
              {evalResult.hasSpecial || evalResult.hasExtendedLength ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="w-3.5 h-3.5 shrink-0 text-slate-300" />
              )}
              <span>Symbol or 12+ chars (recommended)</span>
            </div>
          </>
        )}
      </div>

      {evalResult.error && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] font-semibold text-rose-600 flex items-center gap-1"
          data-testid="password-validation-error"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{evalResult.error}</span>
        </p>
      )}

      {sameAsCurrent && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px] font-semibold text-amber-700 flex items-center gap-1"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>New password must be different from your current password.</span>
        </p>
      )}

      {hasTypedConfirm && (
        <p
          role="status"
          aria-live="polite"
          className={`text-[11px] font-semibold flex items-center gap-1 ${
            passwordsMatch ? 'text-emerald-700' : 'text-rose-600'
          }`}
          data-testid="password-match-status"
        >
          {passwordsMatch ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>Passwords match</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              <span>Passwords do not match</span>
            </>
          )}
        </p>
      )}
    </div>
  );
};
