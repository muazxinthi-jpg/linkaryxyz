import type { Env } from '../env';
import { getPublishedProfile } from './profiles';
import { renderPublicProfileEnhanced } from './publicProfileEnhancer';
import { PERSONAL_PUBLIC_ROLE_LABELS, type PersonalPublicRole } from './profileIdentity';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] || char);
}

function publicIdentityLabel(value: string | null | undefined): string {
  if (!value || !(value in PERSONAL_PUBLIC_ROLE_LABELS)) return 'PERSONAL IDENTITY';
  return PERSONAL_PUBLIC_ROLE_LABELS[value as PersonalPublicRole].toUpperCase();
}

export async function renderPublicProfileWithIdentity(request: Request, env: Env, username: string): Promise<Response> {
  const [base, published] = await Promise.all([
    renderPublicProfileEnhanced(request, env, username),
    getPublishedProfile(username, env),
  ]);
  if (published.profile.profile_type === 'project' || base.status !== 200 || !(base.headers.get('content-type') || '').includes('text/html')) {
    return base;
  }

  let source = await base.text();
  const label = publicIdentityLabel(published.profile.public_role);
  source = source.replace(/<div class="eyebrow">[\s\S]*?<\/div>/, `<div class="eyebrow">${escapeHtml(label)}</div>`);

  const headline = published.profile.professional_headline?.trim();
  if (headline && !source.includes('class="professional-headline"')) {
    source = source.replace(
      /(<div class="handle">[\s\S]*?<\/div>)/,
      `$1<p class="professional-headline">${escapeHtml(headline.slice(0, 140))}</p>`,
    );
  }

  if (!source.includes('id="linkary-personal-identity-style"')) {
    source = source.replace(
      '</head>',
      '<style id="linkary-personal-identity-style">.professional-headline{max-width:650px;margin:12px auto 0;color:#4f423c;font-size:15px;font-weight:750;line-height:1.45;overflow-wrap:anywhere}@media(max-width:650px){.professional-headline{font-size:14px;margin-top:10px;padding:0 8px}}</style></head>',
    );
  }

  const headers = new Headers(base.headers);
  headers.delete('content-length');
  return new Response(source, { status: base.status, statusText: base.statusText, headers });
}
