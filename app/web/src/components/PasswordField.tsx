import { useState, type Ref } from 'react';
import { copy } from '../copy';

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  describedBy?: string;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

// Password input with a show/hide control (F1.R14). Paste and password-manager
// autofill are not blocked. Showing the password does not change focus.
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid = false,
  inputRef,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? copy.hidePassword : copy.showPassword}
      </button>
    </div>
  );
}
