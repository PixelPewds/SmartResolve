import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MagnifyingGlass, BookOpenText } from '@phosphor-icons/react';
import { Skeleton, ErrorNote, Empty, Button } from '../../components/ui.jsx';
import { useApi } from '../../lib/api.js';
import { Article } from './PortalTicket.jsx';

export default function PortalHelp() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  const { data, error, loading, reload } = useApi(`/kb?q=${encodeURIComponent(debounced)}`);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6 md:pb-14 md:pt-10">
      <h1 className="text-[26px] font-semibold tracking-tight">Help centre</h1>
      <p className="mt-1 text-[14px] text-ink-2">Quick fixes for the most common problems. If none of these helps, raise a request.</p>
      <div className="relative mt-6">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <label htmlFor="kb-q" className="sr-only">Search help articles</label>
        <input id="kb-q" type="search" className="field pl-9" placeholder="Search, for example refund or OTP" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-5">
        <ErrorNote error={error} onRetry={reload} />
        {loading && !data && <Skeleton className="h-64" />}
        {data && (data.articles.length === 0
          ? <div className="panel"><Empty icon={BookOpenText} title={`No articles match "${debounced}"`} hint="Describe the problem in a request and the team will help." action={<Button as={Link} to="/portal" size="sm">Raise a request</Button>} /></div>
          : <section className="panel divide-y divide-line">{data.articles.map((a) => <Article key={a.id} a={a} />)}</section>)}
      </div>
    </div>
  );
}
