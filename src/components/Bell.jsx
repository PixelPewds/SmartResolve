import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell as BellIcon, UserPlus, ChatCircle, ArrowFatLinesUp, Timer, Siren, Star, CheckCircle, Tray } from '@phosphor-icons/react';
import { useNotifications } from '../lib/notifications.js';
import { timeAgo } from '../lib/api.js';

export const NOTIF_ICON = {
  assignment: UserPlus, assigned: UserPlus, reply: ChatCircle, escalation: ArrowFatLinesUp,
  sla: Timer, 'sla-warning': Timer, incident: Siren, feedback: Star, resolved: CheckCircle, new: Tray,
};
export const NOTIF_LABEL = {
  assignment: 'Assignment', assigned: 'Assigned', reply: 'Reply', escalation: 'Escalation', sla: 'SLA breach',
  'sla-warning': 'SLA warning', incident: 'Incident', feedback: 'Feedback', resolved: 'Resolved', new: 'New ticket',
};

export function notifHref(n, base) {
  if (n.ticketId) return `${base}/tickets/${n.ticketId}`;
  if (n.incidentId) return `${base}/incidents`;
  return `${base}/notifications`;
}

export default function Bell({ base }) {
  const { notifications, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const top = notifications.slice(0, 8);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}
        className="relative grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sunken hover:text-ink">
        <BellIcon size={19} weight={open ? 'fill' : 'regular'} />
        {unread > 0 && (
          <span className="num absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-p1 px-1 font-mono text-[9.5px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="rise absolute right-0 top-11 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-[12px] border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[13px] font-semibold">Notifications</p>
            {unread > 0 && <button type="button" onClick={() => markRead(notifications.filter((n) => !n.read).map((n) => n.id))} className="text-[12px] text-muted hover:text-ink">Mark all read</button>}
          </div>
          <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
            {top.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">You are all caught up.</li>}
            {top.map((n) => {
              const Icon = NOTIF_ICON[n.type] || BellIcon;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => { markRead([n.id]); setOpen(false); nav(notifHref(n, base)); }}
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-sunken ${n.read ? '' : 'bg-sunken/60'}`}>
                    <Icon size={17} className={`mt-0.5 shrink-0 ${n.type.startsWith('sla') || n.type === 'incident' || n.type === 'escalation' ? 'text-p1' : 'text-ink-2'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[13px] ${n.read ? 'text-ink-2' : 'font-semibold'}`}>{n.title}</span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted">{timeAgo(n.at)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">{n.body}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-p1" aria-label="unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[12.5px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
