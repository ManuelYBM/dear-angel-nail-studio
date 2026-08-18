export interface PhoneCountry {
  iso: string;
  name: string;
  dialCode: string;
  typicalNationalLength: number;
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { iso: 'MX', name: 'México', dialCode: '+52', typicalNationalLength: 10 },
  { iso: 'US', name: 'Estados Unidos', dialCode: '+1', typicalNationalLength: 10 },
  { iso: 'CA', name: 'Canadá', dialCode: '+1', typicalNationalLength: 10 },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502', typicalNationalLength: 8 },
  { iso: 'BZ', name: 'Belice', dialCode: '+501', typicalNationalLength: 7 },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503', typicalNationalLength: 8 },
  { iso: 'HN', name: 'Honduras', dialCode: '+504', typicalNationalLength: 8 },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505', typicalNationalLength: 8 },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506', typicalNationalLength: 8 },
  { iso: 'PA', name: 'Panamá', dialCode: '+507', typicalNationalLength: 8 },
  { iso: 'CU', name: 'Cuba', dialCode: '+53', typicalNationalLength: 8 },
  { iso: 'DO', name: 'República Dominicana', dialCode: '+1', typicalNationalLength: 10 },
  { iso: 'PR', name: 'Puerto Rico', dialCode: '+1', typicalNationalLength: 10 },
  { iso: 'CO', name: 'Colombia', dialCode: '+57', typicalNationalLength: 10 },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58', typicalNationalLength: 10 },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593', typicalNationalLength: 9 },
  { iso: 'PE', name: 'Perú', dialCode: '+51', typicalNationalLength: 9 },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591', typicalNationalLength: 8 },
  { iso: 'CL', name: 'Chile', dialCode: '+56', typicalNationalLength: 9 },
  { iso: 'AR', name: 'Argentina', dialCode: '+54', typicalNationalLength: 10 },
  { iso: 'BR', name: 'Brasil', dialCode: '+55', typicalNationalLength: 11 },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595', typicalNationalLength: 9 },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598', typicalNationalLength: 8 },
  { iso: 'ES', name: 'España', dialCode: '+34', typicalNationalLength: 9 },
] as const;

export const DEFAULT_PHONE_COUNTRY_ISO = 'MX';

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

export function phoneCountry(iso: string): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((country) => country.iso === iso) ??
    PHONE_COUNTRIES.find((country) => country.iso === DEFAULT_PHONE_COUNTRY_ISO)!
  );
}

function countryFromInternationalDigits(digits: string) {
  return [...PHONE_COUNTRIES]
    .sort((left, right) => right.dialCode.length - left.dialCode.length)
    .find((country) => digits.startsWith(digitsOnly(country.dialCode)));
}

function hasInternationalPrefix(value: string) {
  return /^\s*(?:\+|00)/.test(value);
}

function internationalDigits(value: string) {
  const digits = digitsOnly(value);
  return /^\s*00/.test(value) ? digits.slice(2) : digits;
}

function looksLikeSelectedInternationalNumber(value: string, country: PhoneCountry) {
  if (hasInternationalPrefix(value)) return false;
  const digits = digitsOnly(value);
  const dialDigits = digitsOnly(country.dialCode);
  return (
    digits.startsWith(dialDigits) &&
    digits.length === dialDigits.length + country.typicalNationalLength
  );
}

export interface PhoneInputParts {
  countryIso: string;
  inputValue: string;
}

export function splitPhoneInput(
  value: string | null | undefined,
  fallbackCountryIso = DEFAULT_PHONE_COUNTRY_ISO,
  allowEmail = false,
): PhoneInputParts {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || (allowEmail && trimmed.includes('@'))) {
    return { countryIso: fallbackCountryIso, inputValue: trimmed };
  }

  const fallback = phoneCountry(fallbackCountryIso);
  const explicitlyInternational = hasInternationalPrefix(trimmed);
  const digits = explicitlyInternational ? internationalDigits(trimmed) : digitsOnly(trimmed);
  if (explicitlyInternational) {
    const country = countryFromInternationalDigits(digits);
    if (!country) return { countryIso: fallback.iso, inputValue: `+${digits}` };
    const dialDigits = digitsOnly(country.dialCode);
    return { countryIso: country.iso, inputValue: digits.slice(dialDigits.length) };
  }

  if (looksLikeSelectedInternationalNumber(trimmed, fallback)) {
    return {
      countryIso: fallback.iso,
      inputValue: digits.slice(digitsOnly(fallback.dialCode).length),
    };
  }

  return { countryIso: fallback.iso, inputValue: trimmed };
}

export function normalizePhoneInput(
  value: string,
  countryIso = DEFAULT_PHONE_COUNTRY_ISO,
  allowEmail = false,
) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (allowEmail && trimmed.includes('@')) return trimmed;

  const digits = hasInternationalPrefix(trimmed)
    ? internationalDigits(trimmed)
    : digitsOnly(trimmed);
  if (!digits) return trimmed;
  if (hasInternationalPrefix(trimmed)) return `+${digits}`;

  const country = phoneCountry(countryIso);
  if (looksLikeSelectedInternationalNumber(trimmed, country)) return `+${digits}`;
  return `${country.dialCode}${digits}`;
}
