'use client';

import {
  AR,
  BO,
  BR,
  BZ,
  CA,
  CL,
  CO,
  CR,
  CU,
  DO,
  EC,
  ES,
  GT,
  HN,
  MX,
  NI,
  PA,
  PE,
  PR,
  PY,
  SV,
  US,
  UY,
  VE,
} from 'country-flag-icons/react/3x2';
import { useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PHONE_COUNTRY_ISO,
  normalizePhoneInput,
  PHONE_COUNTRIES,
  phoneCountry,
  splitPhoneInput,
} from '@/lib/phone';
import styles from './phone-field.module.css';

const COUNTRY_FLAGS = {
  AR,
  BO,
  BR,
  BZ,
  CA,
  CL,
  CO,
  CR,
  CU,
  DO,
  EC,
  ES,
  GT,
  HN,
  MX,
  NI,
  PA,
  PE,
  PR,
  PY,
  SV,
  US,
  UY,
  VE,
} as const;

interface PhoneFieldProps {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  allowEmail?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  disabled?: boolean;
}

export function PhoneField({
  id,
  name,
  label,
  defaultValue = '',
  required = false,
  allowEmail = false,
  autoComplete = 'tel-national',
  placeholder = '999 123 4567',
  hint,
  maxLength = 80,
  disabled = false,
}: PhoneFieldProps) {
  const initial = splitPhoneInput(defaultValue, DEFAULT_PHONE_COUNTRY_ISO, allowEmail);
  const [countryIso, setCountryIso] = useState(initial.countryIso);
  const [inputValue, setInputValue] = useState(initial.inputValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const hintId = hint ? `${id}-hint` : undefined;

  useEffect(() => {
    const next = splitPhoneInput(defaultValue, DEFAULT_PHONE_COUNTRY_ISO, allowEmail);
    setCountryIso(next.countryIso);
    setInputValue(next.inputValue);
  }, [allowEmail, defaultValue]);

  useEffect(() => {
    const form = containerRef.current?.closest('form');
    if (!form) return;
    const reset = () => {
      const next = splitPhoneInput(defaultValue, DEFAULT_PHONE_COUNTRY_ISO, allowEmail);
      setCountryIso(next.countryIso);
      setInputValue(next.inputValue);
    };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [allowEmail, defaultValue]);

  const normalizedValue = normalizePhoneInput(inputValue, countryIso, allowEmail);
  const selectedCountry = phoneCountry(countryIso);
  const SelectedCountryFlag =
    COUNTRY_FLAGS[selectedCountry.iso as keyof typeof COUNTRY_FLAGS] ?? MX;

  return (
    <div className={styles.field} ref={containerRef}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <div className={styles.countryControl}>
          <div
            className={styles.countryPicker}
            title={`${selectedCountry.name} (${selectedCountry.dialCode})`}
          >
            <SelectedCountryFlag aria-hidden="true" className={styles.flagIcon} focusable="false" />
            <span aria-hidden="true" className={styles.chevron} />
            <select
              aria-label={`${label}: ${selectedCountry.name}, lada ${selectedCountry.dialCode}. Cambiar país`}
              disabled={disabled}
              id={`${id}-country`}
              onChange={(event) => setCountryIso(event.target.value)}
              value={countryIso}
            >
              {PHONE_COUNTRIES.map((country) => (
                <option key={country.iso} value={country.iso}>
                  {country.name} ({country.dialCode})
                </option>
              ))}
            </select>
          </div>
          <span aria-hidden="true" className={styles.dialCode}>
            {selectedCountry.dialCode}
          </span>
        </div>
        <input
          aria-describedby={hintId}
          autoComplete={autoComplete}
          disabled={disabled}
          id={id}
          inputMode={allowEmail ? 'email' : 'tel'}
          maxLength={maxLength}
          onChange={(event) => {
            const next = splitPhoneInput(event.target.value, countryIso, allowEmail);
            setCountryIso(next.countryIso);
            setInputValue(next.inputValue);
          }}
          placeholder={placeholder}
          required={required}
          type={allowEmail ? 'text' : 'tel'}
          value={inputValue}
        />
      </div>
      <input name={name} readOnly type="hidden" value={normalizedValue} />
      {hint ? (
        <span className={styles.hint} id={hintId}>
          {hint}
        </span>
      ) : allowEmail ? (
        <span className={styles.hint}>
          La lada {selectedCountry.dialCode} sólo se aplica cuando escribes un teléfono.
        </span>
      ) : null}
    </div>
  );
}
