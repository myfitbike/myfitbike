import { useEffect, useState } from 'react';
import { api, type Progress } from './api';
let cache: Progress | null = null; const subs = new Set<(p: Progress) => void>();
export async function refreshProgress() { try { cache = await api.progress(); if (cache) for (const s of subs) s(cache); } catch { /* API down: keep last */ } }
export function useProgress() { const [p, setP] = useState(cache); useEffect(() => { subs.add(setP); if (!cache) void refreshProgress(); return () => { subs.delete(setP); }; }, []); return p; }
