import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import styles from './ui.module.css';

interface FieldProps {
  label: string;
  /** Visually hidden label (filter bars). */
  hideLabel?: boolean;
  children: (id: string) => ReactNode;
}

/** A label above a control; children get the id to wire htmlFor. */
export function Field({ label, hideLabel, children }: FieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.fieldLabel}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 'l': 52 px, mono 20 px (login keypad fields). */
  size?: 'm' | 'l';
}

export function Input({ size = 'm', className, ...rest }: InputProps) {
  return <input className={[styles.input, className].filter(Boolean).join(' ')} data-size={size} {...rest} />;
}

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  /** First option with value '' (for «Все участки»). */
  placeholder?: string;
}

export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return (
    <select className={[styles.select, className].filter(Boolean).join(' ')} {...rest}>
      {placeholder != null ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}
