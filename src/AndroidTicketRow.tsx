import { useEffect, useRef, useState, type ReactNode } from 'react';

export function AndroidTicketRow({ children, busy, open }: { children: ReactNode; busy: boolean; open(): void }) {
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return <div className={`ticket-row android-ticket-row ${expanded ? 'expanded' : ''}`} aria-busy={busy}
    onPointerDown={e => {
      if (!e.isPrimary || e.button !== 0 || (e.target as HTMLElement).closest('select, input, .close-row-fields')) return;
      cancel(); suppressClick.current = false; origin.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => { suppressClick.current = true; setExpanded(true); }, 500);
    }}
    onPointerMove={e => { if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) { cancel(); suppressClick.current = true; } }}
    onPointerUp={cancel} onPointerCancel={() => { cancel(); suppressClick.current = true; }} onPointerLeave={cancel}
    onContextMenu={e => e.preventDefault()}
    onClickCapture={e => {
      if ((e.target as HTMLElement).closest('select, input, .close-row-fields')) return;
      e.stopPropagation();
      if (suppressClick.current && e.detail !== 0) { e.preventDefault(); suppressClick.current = false; return; }
      open();
    }}
    onKeyDown={e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); setExpanded(true); } }}>
    {children}
    {expanded && <button className="text-button close-row-fields" onClick={() => setExpanded(false)}>Hide fields</button>}
  </div>;
}
