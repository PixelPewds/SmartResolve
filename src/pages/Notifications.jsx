import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from '@phosphor-icons/react';
import { Page, PageHeader, Tabs, Sim } from '../components/kit.jsx';
import { Empty, Button } from '../components/ui.jsx';
import { NOTIF_ICON, NOTIF_LABEL, notifHref } from '../components/Bell.jsx';
import { useNotifications } from '../lib/notifications.js';
import { fmtDateTime, timeAgo } from '../lib/api.js';

const GROUPS = {
  all: () => true,
  unread: (n) => !n.read,
  assignment: (n) => ['assignment', 'assigned', 'new'].includes(n.type),
  reply: (n) => n.type === 'reply',
  escalation: (n) => ['escalation', 'incident'].includes(n.type),
  sla: (n) => n.type.startsWith('sla'),
};

export default function Notifications({ base }) {
  const { notifications, unread, markRead } = useNotifications();
  const [tab, setTab] = useState('all');
  const nav = useNavigate();
  const staff = base === '/agent';
  const list = notifications.filter(GROUPS[tab]);

  const tabs = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'unread', label: 'Unread', count: unread, alert: true },
    ...(staff ? [
      { value: 'assignment', label: 'Assignments' },
      { value: 'reply', label: 'Replies' },
      { value: 'escalation', label: 'Escalations & incidents' },
      { value: 'sla', label: 'SLA warnings' },
    ] : [{ value: 'reply', label: 'Replies' }]),
  ];

  return (
    <Page className={staff ? '' : 'max-w-3xl'}>
      <PageHeader title="Notifications"
        sub={staff
          ? 'Assignments, customer replies, escalations, incidents and SLA warnings. SLA warnings are worked out from the live clock each time this page loads.'
          : 'Updates about your requests.'}
        actions={unread > 0 && <Button variant="secondary" size="sm" onClick={() => markRead(notifications.filter((n) => !n.read).map((n) => n.id))}>Mark all read</Button>}>
        <div className="mt-2"><Sim title="Notifications are shown in the app only. No email, SMS or WhatsApp is sent in this prototype.">In-app only, nothing is emailed</Sim></div>
      </PageHeader>

      <Tabs className="mt-5" value={tab} onChange={setTab} items={tabs} />

      <div className="panel mt-4 overflow-hidden">
        {list.length === 0 && <Empty icon={Bell} title="Nothing here" hint="New activity will appear as it happens." />}
        <ul className="divide-y divide-line">
          {list.map((n) => {
            const Icon = NOTIF_ICON[n.type] || Bell;
            const urgent = n.type.startsWith('sla') || n.type === 'incident' || n.type === 'escalation';
            return (
              <li key={n.id}>
                <button type="button" onClick={() => { markRead([n.id]); nav(notifHref(n, base)); }}
                  className={`flex w-full gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-sunken sm:px-5 ${n.read ? '' : 'bg-sunken/50'}`}>
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${urgent ? 'bg-p1-bg text-p1' : 'bg-sunken text-ink-2 ring-1 ring-line'}`}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`text-[13.5px] ${n.read ? 'text-ink-2' : 'font-semibold'}`}>{n.title}</span>
                      <span className="rounded border border-line px-1.5 py-px text-[10.5px] text-muted">{NOTIF_LABEL[n.type] || n.type}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[11px] text-muted">{timeAgo(n.at)}</span>
                    <span className="hidden font-mono text-[10.5px] text-faint sm:block">{fmtDateTime(n.at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Page>
  );
}
