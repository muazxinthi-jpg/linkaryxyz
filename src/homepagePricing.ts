const PRICING_SECTION = `<section class="pricing-home" id="pricing" aria-labelledby="pricing-title">
  <div class="pricing-home-head">
    <div><span class="index">06 / PRICING</span><h2 id="pricing-title">Start lean.<br><em>Scale when growth needs it.</em></h2></div>
    <p>Choose the operating allowance that fits your profile or Project. Usage Credits cover provider-assisted and intelligence features while first-party tracking remains available.</p>
  </div>
  <div class="pricing-beta-note"><strong>Controlled Beta</strong><span>We are not requiring payment from initial Beta users. Eligible plans can be granted manually by Linkary while we validate real workflows.</span></div>
  <div class="pricing-home-grid" data-pricing-grid aria-live="polite" aria-busy="true">
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
    <article class="pricing-loading"><span></span><b></b><i></i><i></i><i></i></article>
  </div>
  <p class="pricing-home-footnote">Usage Credits are an operating allowance, not money, rewards, or transferable value. Plan details shown here come from Linkary's live billing catalog.</p>
</section>`;

const LEGACY_INLINE_PRICING = /<script\s+id=["']linkary-pricing-catalog["'][^>]*>[\s\S]*?<\/script>/i;
const STATIC_PRICING_SCRIPT = '<script src="/pricing-catalog.js" defer></script>';

const TRACKING_FIRST_COPY: ReadonlyArray<readonly [string, string]> = [
  [
    'Linkary creator campaign intelligence and social growth attribution.',
    'Linkary tracks Web3 growth across creators, communities, campaigns, links, evidence, and outcomes.',
  ],
  [
    '<title>Linkary — Creator campaigns, connected to outcomes</title>',
    '<title>Linkary — Run growth anywhere. Track it in Linkary.</title>',
  ],
  [
    'Connect creator campaigns to clicks, communities, conversions, and real growth outcomes.',
    'Run growth anywhere. Track creator, community, campaign, link, evidence, and outcome activity in Linkary.',
  ],
  [
    '<button class="btn brand small" data-route="auth" data-auth="signup">Start a campaign ↗</button>',
    '<button class="btn brand small" data-route="auth" data-auth="signup">Start tracking ↗</button>',
  ],
  [
    '<span class="kicker"><i></i>Creator campaign intelligence</span><h1>Know which creators<br>actually drive <em>growth.</em></h1><p>Run creator campaigns, collect every deliverable, and connect social activity to outcomes your team can trust.</p>',
    '<span class="kicker"><i></i>Web3 growth attribution</span><h1>Run growth anywhere.<br><em>Track it in Linkary.</em></h1><p>Track creator, community, and campaign activity whether the work starts in Linkary or somewhere else. Connect links, evidence, and outcomes in one attribution layer.</p>',
  ],
  [
    '<button class="btn brand" data-route="auth" data-auth="signup">Start a campaign ↗</button>',
    '<button class="btn brand" data-route="auth" data-auth="signup">Start tracking ↗</button>',
  ],
  [
    '<div class="proof"><span>✓ First-party tracking</span><span>✓ Multi-platform campaigns</span><span>✓ Auditable results</span></div>',
    '<div class="proof"><span>✓ First-party links</span><span>✓ Evidence-aware attribution</span><span>✓ Auditable outcomes</span></div>',
  ],
  [
    '<div class="cap-rail"><span>Campaign planning</span><i></i><span>Creator collaboration</span><i></i><span>First-party links</span><i></i><span>Outcome attribution</span><i></i><span>Reporting</span></div>',
    '<div class="cap-rail"><span>External campaigns</span><i></i><span>Creator & community identity</span><i></i><span>First-party links</span><i></i><span>Outcome attribution</span><i></i><span>Reporting</span></div>',
  ],
  [
    'They don’t tell you which creator brought valuable people into your community, product, or campaign.',
    'They don’t tell you which creator, community, partner, or channel brought valuable people into your community, product, or campaign.',
  ],
  [
    '<span class="index">02 / WORKFLOW</span><h2>From brief to<br><em>attributable outcome.</em></h2></div><p>One connected workspace for the work between campaign idea and final report.</p>',
    '<span class="index">02 / WORKFLOW</span><h2>From activity to<br><em>attributable outcome.</em></h2></div><p>Bring in work from Linkary or external campaign workflows, then keep identity, links, evidence, and outcomes connected.</p>',
  ],
  [
    '<div class="steps"><button class="active" data-step="brief"><i>01</i><b>Brief</b><small>Set the objective and outcome.</small></button><button data-step="invite"><i>02</i><b>Invite</b><small>Collaborate with creators.</small></button><button data-step="track"><i>03</i><b>Track</b><small>Capture content and events.</small></button><button data-step="prove"><i>04</i><b>Prove</b><small>Connect results to source.</small></button></div>',
    '<div class="steps"><button class="active" data-step="brief"><i>01</i><b>Identify</b><small>Define the project, partner, or activity.</small></button><button data-step="invite"><i>02</i><b>Link</b><small>Create attributable Linkary links.</small></button><button data-step="track"><i>03</i><b>Measure</b><small>Capture evidence and outcomes.</small></button><button data-step="prove"><i>04</i><b>Prove</b><small>Connect results to source.</small></button></div>',
  ],
  [
    '<div><span>STEP 01 / CAMPAIGN BRIEF</span><h3>Start with the outcome<br>you need to create.</h3><p>Define campaign goals, qualified events, dates, creator criteria, and deliverables before invitations go out.</p><button class="btn brand">Create campaign ↗</button></div>',
    '<div><span>OPTIONAL / LINKARY CAMPAIGN WORKSPACE</span><h3>Track an existing campaign<br>or coordinate one here.</h3><p>Bring an external campaign into Linkary for attribution, or use the built-in workspace when you want to coordinate the brief and contributors here.</p><button class="btn brand">Open tracking workspace ↗</button></div>',
  ],
  [
    '<span class="index">03 / TWO-SIDED NETWORK</span><h2>One campaign.<br><em>Both sides connected.</em></h2></div><p>Teams get accountability. Creators get proof of the value they create.</p>',
    '<span class="index">03 / GROWTH NETWORK</span><h2>Projects, creators, communities.<br><em>One evidence graph.</em></h2></div><p>Teams get accountable growth evidence. Creators and communities get attributable proof of the work they contribute.</p>',
  ],
  [
    '<span>FOR PROJECTS & TEAMS</span><h3>Run campaigns without<br>the spreadsheet maze.</h3><p>Brief creators, review deliverables, track links, monitor outcomes, and share one trusted report.</p><ul><li>Campaign workspace</li><li>Creator collaboration</li><li>Outcome-level reporting</li></ul>',
    '<span>FOR PROJECTS & TEAMS</span><h3>Track growth without<br>the spreadsheet maze.</h3><p>Track work across creators, communities, and external partners, preserve source evidence, and connect outcomes without forcing every campaign to run inside Linkary.</p><ul><li>First-party tracking</li><li>Partner & community evidence</li><li>Outcome-level reporting</li></ul>',
  ],
  [
    '<span>FOR CREATORS</span><h3>Turn your work<br>into proof.</h3><p>Manage invitations and deliverables, build a campaign history, and show what your influence is worth.</p><ul><li>Public creator profile</li><li>Campaign history</li><li>Verified outcome record</li></ul>',
    '<span>FOR CREATORS</span><h3>Turn your work<br>into proof.</h3><p>Build a public identity, keep an attributed work history, and show evidence of the campaigns and outcomes you contributed to.</p><ul><li>Public profile</li><li>Attributed work history</li><li>Evidence-aware proof</li></ul>',
  ],
  [
    'Linkary connects each creator, activity, and tracked event so you know where qualified growth came from.',
    'Linkary connects creators, communities, activities, and tracked events so you know where qualified growth came from.',
  ],
  [
    '<span class="index">05 / PRODUCT</span><h2>Built for the work between<br><em>launch and report.</em></h2></div><p>Serious campaign operations without turning the interface into a wall of data.</p>',
    '<span class="index">05 / PRODUCT</span><h2>Built for attribution before,<br><em>during, and after growth.</em></h2></div><p>Use Linkary as the evidence and intelligence layer around campaigns you run anywhere.</p>',
  ],
  [
    '<span>01</span><h3>Campaign command center</h3><p>Objectives, collaborators, deliverables, tracking, and outcomes in one operational view.</p>',
    '<span>01</span><h3>Growth attribution workspace</h3><p>Campaigns, partners, tracking links, evidence, and outcomes in one operational view.</p>',
  ],
  [
    '<span>02</span><h3>Deliverable approvals</h3><p>Keep feedback and campaign status attached to every activity.</p>',
    '<span>02</span><h3>Evidence & activity history</h3><p>Keep published work, submitted evidence, measurement provenance, and lifecycle status attached to every activity.</p>',
  ],
  [
    'Creator deliverables, first-party link events, community joins, registrations, and qualified outcomes configured by your team.',
    'Creator and community activity, first-party link events, submitted evidence, registrations, and qualified outcomes connected to your Project and campaigns.',
  ],
  [
    'Web3 is an initial market, while Linkary is positioned as social analytics and creator campaign attribution.',
    'Linkary is being built for Web3 Projects, creators, communities, and growth teams that need attributable evidence across fragmented campaign channels.',
  ],
  [
    '<span>CREATOR CAMPAIGNS, CONNECTED TO OUTCOMES</span><h2>Make your next creator<br>campaign <em>accountable.</em></h2>',
    '<span>GROWTH ACTIVITY, CONNECTED TO EVIDENCE</span><h2>Run growth anywhere.<br><em>Track it in Linkary.</em></h2>',
  ],
];

export function applyTrackingFirstHomepageCopy(html: string): string {
  let updated = html;
  for (const [from, to] of TRACKING_FIRST_COPY) updated = updated.split(from).join(to);
  return updated;
}

function appendBeforeBody(html: string, markup: string): string {
  if (html.includes('</body>')) return html.replace('</body>', `  ${markup}\n</body>`);
  return `${html}\n${markup}`;
}

export async function enhancePublicHomepage(request: Request, response: Response): Promise<Response> {
  if (request.method !== 'GET') return response;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const pathname = new URL(request.url).pathname;
  let html = applyTrackingFirstHomepageCopy(await response.text());

  // Production legacy pages already contain the correct pricing section, but an
  // older inline renderer can leak JavaScript into the visible document. Remove
  // only that renderer and replace it with a normal external asset. This leaves
  // the existing homepage structure and responsive layout untouched.
  html = html.replace(LEGACY_INLINE_PRICING, '');
  if (html.includes('id="linkary-pricing-grid"') && !html.includes('/pricing-catalog.js')) {
    html = appendBeforeBody(html, STATIC_PRICING_SCRIPT);
  }

  // Fallback for a public shell that does not yet contain the production pricing
  // section. Limit this additive path to the actual homepage only.
  if ((pathname === '/' || pathname === '/index.html') && !html.includes('id="pricing"')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="/pricing-home.css">\n</head>');
    const faqMarker = '<section class="faq" id="faq">';
    if (html.includes(faqMarker)) html = html.replace(faqMarker, `${PRICING_SECTION}\n      ${faqMarker}`);
    else html = html.replace('</main>', `${PRICING_SECTION}\n  </main>`);
    html = appendBeforeBody(html, '<script src="/pricing-home.js" defer></script>');
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
