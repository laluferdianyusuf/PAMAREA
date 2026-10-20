import { randomBytes } from 'crypto';
import { RoleName } from '../../generated/prisma/enums.js';

const ROLE_PREFIX: Record<RoleName, string> = {
  ADMIN: 'ADM',
  SECURITY: 'SEC',
  DANRU_SECURITY: 'DAN_SEC',
  CHIEF_SECURITY: 'CHF_SEC',
};

export function generateEmployeeNumber(role: RoleName): string {
  const prefix = ROLE_PREFIX[role] ?? 'EMP';

  const random = randomBytes(4).toString('hex').toUpperCase();

  return `${prefix}-${random}`;
}
