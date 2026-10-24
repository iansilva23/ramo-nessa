import { DriverRegistryError } from './driver-registry-service.js';

// Validates formatting/check digits locally; no paid CPF lookup is required.
export function normalizeDriverCpf(value: unknown): string {
  const cpf = typeof value === 'string' ? value.trim().replace(/[.\-\s]/g, '') : '';
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
    throw new DriverRegistryError('DRIVER_CPF_INVALID', 'Informe um CPF válido do motorista.');
  }
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    const digit = (sum * 10 % 11) % 10;
    if (digit !== Number(cpf[size])) throw new DriverRegistryError('DRIVER_CPF_INVALID', 'Informe um CPF válido do motorista.');
  }
  return cpf;
}
