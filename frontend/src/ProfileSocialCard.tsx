import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import './profile-social-card.css';

export type SocialCardAnalytics = {
  linkClicks: number; sections: number; connectedChannels: number;
  x: { handle: string | null; followers: number | null; source: string };
  monthlyClicks: Array<{ month: string; count: number }>;
  platformClicks?: Array<{ platform: string; count: number }>;
  proof?: { metrics: Array<{ label: string; value: string }> } | null;
};
type Props = {
  profile: { username: string; display_name: string; profile_type: string };
  data: { displayName: string; bio: string; avatarUrl: string | null; visibility: string };
  analytics: SocialCardAnalytics; completionPercent: number;
};
const number = (value: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const monthLabel = (value: string) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });


function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0',
    pointer: 'M4 2l7 19 3-8 8-3L4 2 M14 14l6 6',
    campaign: 'M3 10v5h4l13 5V4L7 10H3 M7 15l2 6h4l-2-5 M7 10v5',
    shield: 'M12 2l9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4 M8 12l3 3 5-6',
    globe: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0 M3 12h18 M12 3c-5 5-5 13 0 18c5-5 5-13 0-18',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0',
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
    chart: 'M3 21V3 M3 21h18 M7 17v-5 M12 17V9 M17 17V5',
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.link} /></svg>;
}

function Canvas({ profile, data, analytics, completionPercent }: Props) {
  const [point, setPoint] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [data.avatarUrl]);
  const avatar = data.avatarUrl?.startsWith('https://') ? data.avatarUrl : null;
  const name = data.displayName || profile.display_name;
  const months = analytics.monthlyClicks;
  const max = Math.max(1, ...months.map(row => row.count));
  const xy = months.map((row, i) => [42 + i * 460 / Math.max(1, months.length - 1), 162 - row.count / max * 130]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const platforms = analytics.platformClicks || [];
  const total = platforms.reduce((sum, row) => sum + row.count, 0);
  const proof = (labels: string[]) => analytics.proof?.metrics.find(row => labels.includes(row.label))?.value;
  const campaigns = proof(['Tracked campaigns', 'Accepted campaigns']);
  const outcomes = proof(['Verified outcomes']);
  const stats = [
    ['users', 'X FOLLOWERS', analytics.x.followers === null ? 'Unavailable' : number(analytics.x.followers), analytics.x.followers === null ? 'X data not available' : 'Latest provider snapshot'],
    ['pointer', 'PROFILE CLICKS', number(analytics.linkClicks), 'All time · Linkary measured'],
    ['campaign', 'CAMPAIGNS', campaigns || 'Unavailable', profile.profile_type === 'project' ? 'Tracked campaigns' : 'Accepted campaign relationships'],
    ['shield', 'VERIFIED OUTCOMES', outcomes || 'Unavailable', 'Tracked or verified evidence'],
    ['globe', 'AUDIENCE REACH', 'Unavailable', 'No measured reach available'],
    ['eye', 'IMPRESSIONS', 'Unavailable', 'No impression data available'],
  ];
  return <article className="lsc-canvas" aria-label={`${name}'s Linkary social card`}>
    <header className="lsc-identity">
      <div className="lsc-avatar">{avatar && !imageFailed ? <img src={avatar} alt={name} onError={() => setImageFailed(true)} referrerPolicy="no-referrer" /> : <span>{name.slice(0, 2)}</span>}</div>
      <div className="lsc-person"><h2>{name}</h2><span>@{profile.username}</span><p>{data.bio || 'Your work. Your connections. Your Linkary identity.'}</p></div>
      <div className="lsc-status">{data.visibility === 'published' ? 'Public profile' : 'Draft profile'}</div>
      <a className="lsc-url" href={`https://linkary.xyz/${encodeURIComponent(profile.username)}`} target="_blank" rel="noreferrer"><span>↗ <small>Public link</small></span><b>linkary.xyz/{profile.username}</b></a>
      <div className="lsc-source"><i />Linkary data<small>Measured activity</small></div>
    </header>
    <div className="lsc-metrics">{stats.map(([icon, label, value, note]) => <div className="lsc-metric" key={label}><span><i><Icon name={icon} /></i>{label}</span><strong className={value === 'Unavailable' ? 'lsc-missing' : ''}>{value}</strong><small>{note}</small></div>)}</div>
    <div className="lsc-charts">
      <section className="lsc-growth"><header><h3>GROWTH PULSE</h3><span>Monthly profile clicks · UTC</span></header>
        {months.length ? <><svg viewBox="0 0 540 198" role="group" aria-label="Monthly profile link clicks" onPointerLeave={() => setPoint(null)}>
          {[0, .5, 1].map(t => <g key={t}><line x1="42" x2="502" y1={162 - t * 130} y2={162 - t * 130} stroke="#ff65002b" strokeDasharray="2 4" /><text x="30" y={167 - t * 130} textAnchor="end">{number(max * t)}</text></g>)}
          {xy.length > 1 && <path d={`${line} L502,162 L42,162 Z`} fill="#ff650015" />}
          <path d={line} fill="none" stroke="#ff6500" strokeWidth="3" />
          {months.map((row, i) => <g key={row.month}><circle cx={xy[i][0]} cy={xy[i][1]} r={point === i ? 5 : 3} fill="#ff6500" stroke="#ffe8d2" strokeWidth={point === i ? 2 : 0} />{(i % 3 === 0 || i === months.length - 1) && <text x={xy[i][0]} y="189" textAnchor="middle">{monthLabel(row.month)}</text>}<rect x={xy[i][0] - 18} y="10" width="36" height="158" fill="transparent" tabIndex={0} role="button" aria-label={`${monthLabel(row.month)}: ${row.count} clicks`} onFocus={() => setPoint(i)} onBlur={() => setPoint(null)} onPointerEnter={() => setPoint(i)} onPointerDown={() => setPoint(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPoint(i); } }}><title>{monthLabel(row.month)}: {row.count} clicks</title></rect></g>)}
        </svg><p className="lsc-chart-note" aria-live="polite">{point !== null && months[point] ? `${monthLabel(months[point].month)} · ${months[point].count.toLocaleString()} measured clicks` : `${monthLabel(months[0].month)} to ${monthLabel(months[months.length - 1].month)} · Hover or touch to explore`}</p></> : <p className="lsc-empty">Your measured click history will appear here.</p>}
      </section>
      <section className="lsc-platforms"><header><h3>PLATFORM CONTRIBUTION</h3><span>Profile click destinations · All time</span></header>
        {total > 0 ? platforms.slice(0, 5).map(row => <div className="lsc-bar" key={row.platform} tabIndex={0} title={`${row.platform}: ${row.count} clicks (${(row.count / total * 100).toFixed(1)}%)`}><span>{row.platform}</span><div><i style={{ width: `${row.count / total * 100}%` }} /></div><b>{Math.round(row.count / total * 100)}%</b><small>{row.count} clicks</small></div>) : <div className="lsc-empty"><span className="lsc-empty-mark">↗</span>Platform shares appear when click destinations are measured.</div>}
        <p className="lsc-chart-note">Share of measured outbound clicks, not audience reach.</p>
      </section>
    </div>
    <section className="lsc-evidence"><header><h3>EVIDENCE SUMMARY</h3><span>Your Linkary record</span></header><div>
      {[[number(analytics.linkClicks), 'Measured clicks', 'All time'], [outcomes || 'Unavailable', 'Verified outcomes', 'Evidence backed'], [String(analytics.connectedChannels), 'Social channels', 'Enabled profile links'], [String(analytics.sections), 'Profile sections', 'Enabled content'], [`${completionPercent}%`, 'Profile completeness', 'Setup progress']].map(([value, label, note], i) => <div key={label}><i><Icon name={['pointer', 'shield', 'link', 'users', 'chart'][i]} /></i><strong>{value}</strong><span>{label}</span><small>{note}</small></div>)}
    </div></section>
    <footer className="lsc-footer"><b><svg aria-hidden="true" viewBox="0 0 26 26" width="20" height="20" fill="currentColor"><path d="M8 2h16v4H8zM2 8h22v4H2zM12 14h12v4H12zM2 20h22v4H2z" /></svg> Linkary</b><span>Built for creators. <em>Backed by proof.</em></span><small>Source: Linkary Analytics · UTC</small></footer>
  </article>;
}

function ScaledCard(props: Props & { preview?: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={element} className={`lsc-scale ${props.preview ? 'lsc-preview' : ''}`} style={{ height: width * 660 / 1120 }} onPointerMove={event => {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    setTilt({ x: (event.clientY - box.top) / box.height - .5, y: (event.clientX - box.left) / box.width - .5 });
  }} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
    <div className="lsc-size" inert={props.preview} style={{ transform: `scale(${width / 1120})`, '--lsc-x': `${-tilt.x * 3}deg`, '--lsc-y': `${tilt.y * 3}deg` } as CSSProperties}><Canvas {...props} /></div>
  </div>;
}

export default function ProfileSocialCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!expanded) return;
    dialog.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; opener.current?.focus(); };
  }, [expanded]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(`https://linkary.xyz/${encodeURIComponent(props.profile.username)}`); setCopied('Link copied'); }
    catch { setCopied('Copy from the public link in your card.'); }
  }
  return <section className="lsc" aria-label="Your social card">
    <header className="lsc-heading"><span>YOUR SOCIAL CARD</span><small>Open to explore</small></header>
    <div className="lsc-preview-wrap"><ScaledCard {...props} preview /><button ref={opener} type="button" className="lsc-open-overlay" aria-label="Open full-size social card" onClick={() => setExpanded(true)} /></div>
    <div className="lsc-actions"><button type="button" onClick={() => setExpanded(true)}>Expand card ↗</button><button type="button" onClick={() => void copyLink()}>Copy profile link</button></div><p role="status" className="lsc-copy-status">{copied}</p>
    {expanded && createPortal(<dialog ref={dialog} className="lsc-dialog" aria-labelledby="lsc-dialog-title" onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} onClick={e => { if (e.target === e.currentTarget) setExpanded(false); }}><div className="lsc-dialog-content"><header><h2 id="lsc-dialog-title">Your social card</h2><button type="button" autoFocus onClick={() => setExpanded(false)} aria-label="Close social card">Close ×</button></header><div className="lsc-full-scroll"><div className="lsc-full-width"><ScaledCard {...props} /></div></div><div className="lsc-actions"><button type="button" onClick={() => void copyLink()}>Copy profile link</button><span role="status">{copied || 'Hover or touch the chart to explore your activity.'}</span></div></div></dialog>, document.body)}
  </section>;
}
