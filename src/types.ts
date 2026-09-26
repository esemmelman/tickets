export const priorities = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const statuses = ['Open', 'In progress', 'Waiting', 'Done', 'Cancelled'] as const;
export type Priority = typeof priorities[number];
export type Status = typeof statuses[number];
export type Draft = { title: string; description: string; due_date: string | null; priority: Priority | null; status: Status | null };
export type Ticket = Draft & { id: number; user_id: string; archived: boolean; created_at: string; updated_at: string; request_id: string };
export type Comment = { id: string; ticket_id: number; body: string; created_at: string; updated_at: string };
export type Attachment = { id: string; ticket_id: number; name: string; path: string; size: number; created_at: string };
declare global { const __APP_VERSION__: string; }
