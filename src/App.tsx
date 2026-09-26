import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Archive, ArrowDown, Check, Circle, Clock3, FileText, LogOut, RefreshCw, Search, Ticket as TicketIcon, X } from 'lucide-react';
import { blankDraft, displayDate, errorMessage, localDate, passwordExpiry, supabase } from './lib';
import { createTicket, loadTickets, updateTicket } from './api';
import { priorities, statuses } from './types';
import type { Draft, Ticket } from './types';
import { parseVoice } from './parseVoice';
import { recognitionConstructor, VoiceCapture } from './voice';
import { TicketDetail } from './TicketDetail';
import { AndroidTicketRow } from './AndroidTicketRow';

const android = /Android/i.test(navigator.userAgent);

function Fields({ draft, change }: { draft: Draft; change: (draft: Draft) => void }) {
  return <div className="fields"><label>Due date<input type="date" value={draft.due_date || ''} onChange={e => change({ ...draft, due_date: e.target.value || null })}/></label><label>Priority<select value={draft.priority || ''} onChange={e => change({ ...draft, priority: e.target.value as Draft['priority'] || null })}><option value="">None</option>{priorities.map(p => <option key={p}>{p}</option>)}</select></label><label>Status<select value={draft.status || ''} onChange={e => change({ ...draft, status: e.target.value as Draft['status'] || null })}><option value="">None</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label></div>;
}
export { Fields };
function SignIn({ message }: { message: string }) {
  const [email, setEmail] = useState(localStorage.getItem('tickets-email') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="login"><div className="login-brand"><TicketIcon size={27}/><h1>Tickets</h1><span className="version">v{__APP_VERSION__}</span></div><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { const result = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) throw result.error; localStorage.setItem('tickets-email', email.trim()); setPassword(''); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }}><h2>Sign in</h2><p className="muted">Use your existing Supabase Auth account.</p>{message && <p role="status">{message}</p>}<label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="login-note"><Clock3 size={14}/> Remembered on this device for 90 days.</p></form></main>;
}
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [authMessage, setAuthMessage] = useState('');
  useEffect(() => {
    const accept = (next: Session | null) => {
      if (next && passwordExpiry(next.access_token) <= Date.now()) { setAuthMessage('Please sign in again to start a new 90-day session.'); setSession(null); }
      else { setSession(next); if (next) setAuthMessage(''); }
      setChecking(false);
    };
    supabase.auth.getSession().then(({ data, error }) => { if (error) setAuthMessage(error.message); accept(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => accept(next));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => { if (passwordExpiry(session.access_token) <= Date.now()) { setSession(null); setAuthMessage('Your 90-day session has ended. Please sign in again.'); void supabase.auth.signOut({ scope: 'local' }); } }, 10000);
    return () => clearInterval(interval);
  }, [session]);
  if (checking) return <div className="loading">Loading…</div>;
  if (!session) return <SignIn message={authMessage}/>;
  return <Workspace key={session.user.id} email={session.user.email || ''}/>;
}
function Workspace({ email }: { email: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [query, setQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const inputHold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputOrigin = useRef({ x: 0, y: 0 });
  const suppressInputClick = useRef(false);
  const cancelInputHold = () => clearTimeout(inputHold.current);
  useEffect(() => cancelInputHold, []);
  useEffect(() => { if (searchVisible) searchInput.current?.focus(); }, [searchVisible]);
  const showSearch = () => {
    voice.current?.cancel(); setListening(false); setSearchVisible(true);
  };
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('due');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const updateLocks = useRef(new Set<number>());
  const typedDraft = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const voice = useRef<VoiceCapture | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const savingRef = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => { setLoading(true); try { setTickets(await loadTickets()); setError(''); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); return () => { voice.current?.cancel(); }; }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  const save = async (value = draft) => {
    if (savingRef.current || !value.title.trim()) return;

    savingRef.current = true; setSaving(true); setError('');
    try { const ticket = await createTicket(value, requestId.current); setTickets(items => [ticket, ...items.filter(t => t.id !== ticket.id)]); setDraft(blankDraft()); typedDraft.current = false; requestId.current = crypto.randomUUID(); setNotice(`Ticket #${ticket.id} saved`); }
    catch (e) { setError(errorMessage(e)); setDraft(value); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const toggleVoice = () => {

    if (listening) { voice.current?.stop(false); return; }
    if (typedDraft.current && draftRef.current.title.trim()) return;
    if (!recognitionConstructor()) { setError('Voice entry is unavailable in this browser. Open Tickets in Chrome or type your ticket.'); return; }
    typedDraft.current = false;
    setListening(true); setError('');
    const starting = draft;
    voice.current = new VoiceCapture({
      transcript: text => { setDraft({ ...parseVoice([starting.title, text].filter(Boolean).join(' '), new Date(), starting), description: starting.description }); },
      finish: (text, autoSave) => {
        setListening(false);
        const parsed = text.trim() ? { ...parseVoice([starting.title, text].filter(Boolean).join(' '), new Date(), starting), description: starting.description } : draftRef.current;
        setDraft(parsed);
        if (autoSave && !typedDraft.current && parsed.title.trim()) void save(parsed);
      },
      error: message => { setListening(false); setError(message); },
    });
    void voice.current.start();
  };
  const submit = () => {

    if (listening) voice.current?.stop(true);
    else void save(draftRef.current);
  };
  const typeTitle = (title: string) => {
    typedDraft.current = true;
    voice.current?.cancel(); setListening(false);
    const next = { ...draftRef.current, title };
    draftRef.current = next; setDraft(next);


  };
  const editInline = async (ticket: Ticket, changes: Partial<Draft>) => {
    if (updateLocks.current.has(ticket.id)) return;
    updateLocks.current.add(ticket.id); setUpdating(new Set(updateLocks.current)); setError('');
    try {
      const updated = await updateTicket(ticket.id, changes);
      setTickets(items => items.map(t => t.id === updated.id ? updated : t));
    } catch (e) { setError(errorMessage(e)); }
    finally { updateLocks.current.delete(ticket.id); setUpdating(new Set(updateLocks.current)); }
  };
  const unfinished = (t: Ticket) => !['Done', 'Cancelled'].includes(t.status || '');
  const active = tickets.filter(t => !t.archived && unfinished(t));
  const filtered = tickets.filter(t => t.archived === (view === 'archive') && (status === 'all' || (status ? t.status === status : view === 'archive' || unfinished(t))) && (!priority || t.priority === priority) && `${t.id} ${t.title} ${t.description} ${t.due_date || ''} ${t.priority || ''} ${t.status || ''}`.toLowerCase().includes(query.toLowerCase().replace(/^#/, ''))).sort((a, b) => sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id - b.id : sort === 'priority' ? priorities.indexOf(b.priority!) - priorities.indexOf(a.priority!) || b.id - a.id : b.id - a.id);
  const idDigits = filtered.reduce((width, ticket) => Math.max(width, String(ticket.id).length), 4);
  const overdue = (t: Ticket) => !!t.due_date && t.due_date < localDate() && !['Done', 'Cancelled'].includes(t.status || '');
  return <div className={`app ${android ? 'android' : ''}`}><header className="topbar"><div className="brand"><span className="brand-icon"><TicketIcon size={23}/></span><h1>Tickets</h1><span className="version">v{__APP_VERSION__}</span></div><div className="account"><span>{email}</span><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setError(error.message); }}><LogOut size={18}/></button></div></header>
  <main className="workspace"><div className="summary"><span><strong>{active.length}</strong> active</span><span><span className="dot amber"/><strong>{active.filter(t => t.status === 'In progress').length}</strong> in progress</span><span><span className="dot red"/><strong>{active.filter(overdue).length}</strong> overdue</span><span><span className="dot green"/><strong>{tickets.filter(t => !t.archived && t.status === 'Done').length}</strong> done</span></div>
    <section className={`composer compact-composer ${listening ? 'is-listening' : ''}`} aria-label="Add ticket">
      <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <div className="composer-input-bar"><input ref={titleInput} aria-label="Ticket title" aria-description={android ? "Tap to start or stop voice entry. Press Enter to save. Long press to show search." : "Tap to start or stop voice entry. Press Enter to save."} aria-busy={saving} maxLength={500} value={draft.title} disabled={saving} onPointerDown={e => {
          if (!android || !e.isPrimary || e.button !== 0) return;
          cancelInputHold(); suppressInputClick.current = false; inputOrigin.current = { x: e.clientX, y: e.clientY };
          inputHold.current = setTimeout(() => { suppressInputClick.current = true; showSearch(); }, 500);
        }} onPointerMove={e => { if (Math.hypot(e.clientX - inputOrigin.current.x, e.clientY - inputOrigin.current.y) > 10) cancelInputHold(); }}
        onPointerUp={cancelInputHold} onPointerCancel={cancelInputHold} onPointerLeave={cancelInputHold}
        onContextMenu={e => { if (android) e.preventDefault(); }}
        onClick={() => { if (suppressInputClick.current) { suppressInputClick.current = false; return; } toggleVoice(); }} onChange={e => typeTitle(e.target.value)} onKeyDown={e => { if (android && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); showSearch(); return; } if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
        {!android && <fieldset disabled={saving}><Fields draft={draft} change={next => { voice.current?.cancel(); setListening(false); draftRef.current = next; setDraft(next); }}/></fieldset>}</div>
        <span className="voice-status" role="status">{listening ? 'Listening. Tap again to stop.' : saving ? 'Saving ticket.' : ''}</span>
      </form>
    </section>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
    <section className="ticket-panel" aria-label="Tickets">{!android && <div className="panel-toolbar"><nav className="tabs" aria-label="Ticket views"><button className={view === 'active' ? 'selected' : ''} onClick={() => setView('active')}><FileText size={16}/>Active <span>{active.length}</span></button><button className={view === 'archive' ? 'selected' : ''} onClick={() => setView('archive')}><Archive size={16}/>Archive <span>{tickets.filter(t => t.archived).length}</span></button></nav><button className="icon-button" aria-label="Refresh tickets" disabled={loading} onClick={() => void refresh()}><RefreshCw size={17} className={loading ? 'spin' : ''}/></button></div>}<div className="filterbar">{(!android || searchVisible) && <label className="search"><Search size={18}/><input ref={searchInput} aria-label="Find tickets" placeholder="Find by title, number, or description…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15}/></button>}{android && <button className="icon-button" aria-label="Hide search" onClick={() => { setQuery(''); setSearchVisible(false); }}><X size={15}/></button>}</label>}<select aria-label="Filter status" value={android && view === 'archive' ? 'archive' : status} onChange={e => { if (android) { setView(e.target.value === 'archive' ? 'archive' : 'active'); setStatus(e.target.value === 'archive' ? '' : e.target.value); } else setStatus(e.target.value); }}><option value="">{android || view === 'active' ? 'Active statuses' : 'All statuses'}</option>{(android || view === 'active') && <option value="all">All statuses</option>}{android && <option value="archive">Archive</option>}{statuses.map(s => <option key={s}>{s}</option>)}</select><select aria-label="Filter priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map(p => <option key={p}>{p}</option>)}</select><label className="sort"><ArrowDown size={16}/><select aria-label="Sort tickets" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest</option><option value="due">Date, title ↑</option><option value="priority">Priority</option></select></label></div>
    <div className="table-head"><span>Ticket</span><span>Status</span><span>Priority</span><span>Due date</span></div><div className="ticket-list">{loading && !tickets.length ? <p className="empty">Loading tickets…</p> : filtered.length ? filtered.map(t => { const content = <>
      <div className="ticket-title"><span className={`status-icon ${t.status === 'Done' ? 'done' : ''}`}>{t.status === 'Done' ? <Check size={17}/> : <Circle size={17}/>}</span><div><span className="number" style={android ? { width: `${idDigits + 3}ch` } : undefined}>#{t.id}{android ? '  ' : ''}</span>{android ? null : " "}<button className="ticket-title-button" aria-description={android ? "Tap to open ticket. Long press to edit status, priority, and due date." : undefined} aria-label={`#${t.id} ${t.title}`} onClick={() => setSelected(t)}>{t.title}{android && <span className={`ticket-list-date ${overdue(t) ? 'overdue' : ''}`}> · {t.due_date ? <time dateTime={t.due_date}>{displayDate(t.due_date)}</time> : 'No date'}</span>}</button>{t.description && <p>{t.description}</p>}</div></div>
      <select className={`inline-status status-${(t.status || '').toLowerCase().replaceAll(' ', '-')}`} aria-label={`Status for ticket ${t.id}`} value={t.status || ''} disabled={updating.has(t.id)} onChange={e => void editInline(t, { status: e.target.value as Draft['status'] || null })}><option value="">None</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
      <select className="inline-priority" aria-label={`Priority for ticket ${t.id}`} value={t.priority || ''} disabled={updating.has(t.id)} onChange={e => void editInline(t, { priority: e.target.value as Draft['priority'] || null })}><option value="">None</option>{priorities.map(p => <option key={p}>{p}</option>)}</select>
      <input type="date" className={`inline-date ${overdue(t) ? 'overdue' : ''}`} aria-label={`Due date for ticket ${t.id}`} value={t.due_date || ''} disabled={updating.has(t.id)} onChange={e => void editInline(t, { due_date: e.target.value || null })}/>
    </>; return android ? <AndroidTicketRow key={t.id} busy={updating.has(t.id)} open={() => setSelected(t)}>{content}</AndroidTicketRow> : <div className="ticket-row" key={t.id} aria-busy={updating.has(t.id)}>{content}</div>; }) : <div className="empty"><TicketIcon size={30}/><p>{query || status || priority ? 'No matching tickets' : view === 'archive' ? 'No archived tickets' : 'No tickets yet'}</p>{!query && view === 'active' && <button className="text-button" onClick={() => titleInput.current?.focus()}>Add a ticket above</button>}</div>}</div><div className="panel-footer">{filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}<span>v{__APP_VERSION__}</span></div></section>
  </main>{notice && <div className="toast" role="status"><Check size={17}/>{notice}</div>}{selected && <TicketDetail ticket={selected} close={() => setSelected(null)} changed={updated => { setTickets(items => items.map(t => t.id === updated.id ? updated : t)); setSelected(updated); }} deleted={id => { setTickets(items => items.filter(t => t.id !== id)); setSelected(null); setNotice(`Ticket #${id} deleted`); }} notify={setNotice}/>}</div>;
}
