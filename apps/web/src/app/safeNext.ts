/** Where to go after login: a path on this site only. "//host" and "/\host" are other sites to a browser (security audit 2, V10). */
export const safeNext = (next: string | null): string => (next && /^\/(?![/\\])/.test(next) ? next : '/');
