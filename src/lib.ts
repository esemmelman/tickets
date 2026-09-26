import { createClient } from '@supabase/supabase-js';
import type { Draft } from './types';
export const supabase = createClient('https://fgomaujsdblpzxhnnqrg.supabase.co', 'sb_publishable_JOUqLZDnfGu_yCa6k6FVDQ_AYwpr72i', { auth: { storageKey: 'personal-tickets-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
export const bucket = 'personal-ticket-files';
export const sessionDays = 90;
export function passwordExpiry(token: string): number {
  try {
    const raw = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const jwt = JSON.parse(atob(raw));
    const stamps = (jwt.amr ?? []).filter((a: { method: string }) => a.method === 'password').map((a: { timestamp: number }) => a.timestamp);
    return stamps.length ? (Math.max(...stamps) + sessionDays * 86400) * 1000 : 0;
  } catch { return 0; }
}
export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function blankDraft(): Draft { return { title: '', description: '', due_date: localDate(), priority: 'Medium', status: 'Open' }; }
export function displayDate(value: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'; }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Something went wrong. Please try again.'; }
export function fileSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
