export function postgresTls() {
  const ca = process.env.AGROMAX_POSTGRES_CA?.trim();
  return ca ? { ca, rejectUnauthorized: true } : undefined;
}
