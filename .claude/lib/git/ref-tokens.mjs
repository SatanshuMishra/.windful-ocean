const REF_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const MAX_REF_TOKEN_LEN = 255;

export function validateRefToken(token) {
  if (typeof token !== 'string') return false;
  if (token.length === 0 || token.length > MAX_REF_TOKEN_LEN) return false;
  if (!REF_TOKEN_PATTERN.test(token)) return false;
  if (token.startsWith('-')) return false;
  if (token.includes('..')) return false;
  return token.split('/').every((part) => !part.endsWith('.lock') && !part.endsWith('.'));
}
