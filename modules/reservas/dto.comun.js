/** Decimal de Prisma (o null) → número para el DTO. */
export const num = (v) => (v === null || v === undefined ? null : Number(v));
