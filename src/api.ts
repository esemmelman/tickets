import { supabase, bucket } from './lib';
import type { Ticket, Draft, Attachment, Comment } from './types';
export async function loadTickets(): Promise<Ticket[]> {
  const tickets: Ticket[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('personal_tickets').select('*').order('id', { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    tickets.push(...data);
    if (data.length < 500) return tickets;
  }
}
export async function createTicket(draft: Draft, requestId: string) {
  const { data, error } = await supabase.from('personal_tickets').insert({ ...draft, title: draft.title.trim(), request_id: requestId }).select().single();
  if (error?.code === '23505') {
    const existing = await supabase.from('personal_tickets').select('*').eq('request_id', requestId).single();
    if (existing.error) throw existing.error;
    return existing.data as Ticket;
  }
  if (error) throw error;
  return data as Ticket;
}
export async function updateTicket(id: number, changes: Partial<Draft & { archived: boolean }>) {
  const { data, error } = await supabase.from('personal_tickets').update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data as Ticket;
}
export async function loadComments(id: number): Promise<Comment[]> {
  const { data, error } = await supabase.from('personal_ticket_comments').select('*').eq('ticket_id', id).order('created_at');
  if (error) throw error; return data;
}
export async function loadAttachments(id: number): Promise<Attachment[]> {
  const { data, error } = await supabase.from('personal_ticket_attachments').select('*').eq('ticket_id', id).order('created_at');
  if (error) throw error; return data;
}
export async function uploadFile(ticket: Ticket, file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error('Files must be 25 MB or smaller.');
  const path = `${ticket.user_id}/${ticket.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const uploaded = await supabase.storage.from(bucket).upload(path, file);
  if (uploaded.error) throw uploaded.error;
  const saved = await supabase.from('personal_ticket_attachments').insert({ ticket_id: ticket.id, name: file.name, path, size: file.size });
  if (saved.error) { await supabase.storage.from(bucket).remove([path]); throw saved.error; }
}
export async function removeFile(file: Attachment) {
  const removed = await supabase.storage.from(bucket).remove([file.path]);
  if (removed.error) throw removed.error;
  const result = await supabase.from('personal_ticket_attachments').delete().eq('id', file.id);
  if (result.error) throw result.error;
}
export async function deleteTicket(ticket: Ticket) {
  const files = await loadAttachments(ticket.id);
  if (files.length) {
    const { error } = await supabase.storage.from(bucket).remove(files.map(f => f.path));
    if (error) throw error;
  }
  const { error } = await supabase.from('personal_tickets').delete().eq('id', ticket.id);
  if (error) throw error;
}
