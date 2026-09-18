(() => {
  const grid = document.querySelector('[data-pricing-grid]');
  if (!grid) return;
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const money = (cents,currency='USD') => {
    if (cents === null || cents === undefined) return 'Custom';
    if (Number(cents) === 0) return '$0';
    try{return new Intl.NumberFormat('en-US',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents)/100)}catch{return `$${(Number(cents)/100).toFixed(2)}`}
  };
  const seats = (v) => v === null || v === undefined ? 'Custom' : Number(v) === 0 ? 'Personal' : Number(v) === 1 ? '1 Project seat' : `Up to ${Number(v).toLocaleString()} Project seats`;
  const cta = (code) => ({free:'Create Profile',personal_pro:'Start Pro',project_manual:'Start Project',project_automate:'Start Automate',project_growth:'Start Growth',scale:'Request Access'})[code] || 'Create Profile';
  const card = (p) => {
    const featured = p.code === 'project_automate';
    const effective = p.effectivePriceCents ?? p.basePriceCents;
    const discounted = p.promotion && p.basePriceCents !== null && effective !== null && Number(effective) < Number(p.basePriceCents);
    const price = p.basePriceCents === null || p.billingPeriod === 'custom' ? '<strong>Custom</strong>' : `<strong>${money(effective,p.currency)}</strong>${discounted?` <span><s>${money(p.basePriceCents,p.currency)}</s></span>`:''}${p.billingPeriod==='monthly'?'<span> / month</span>':''}`;
    return `<article class="pricing-card${featured?' featured':''}"><div class="pricing-top"><div><span class="pricing-kicker">${esc(p.audience)}</span><h3>${esc(p.name)}</h3></div>${featured?'<span class="pricing-badge">Recommended</span>':''}</div><p class="desc">${esc(p.description)}</p><div class="pricing-price">${price}</div><div class="pricing-allowance"><div><small>Monthly Usage Credits</small><b>${Number(p.monthlyUsageCredits||0).toLocaleString()}</b></div><div><small>Access</small><b>${esc(seats(p.projectSeatLimit))}</b></div></div><ul class="pricing-features">${(Array.isArray(p.features)?p.features:[]).slice(0,6).map((f)=>`<li>${esc(f)}</li>`).join('')}</ul><a class="button ${featured?'primary':'secondary'} compact" href="https://app.linkary.xyz/signup">${esc(cta(p.code))} →</a></article>`;
  };
  const fail = () => { grid.setAttribute('aria-busy','false'); grid.innerHTML = '<article class="pricing-card"><h3>Pricing unavailable</h3><p class="desc">The rest of Linkary is still available. Refresh to try again.</p><button class="button secondary compact" type="button" data-pricing-retry>Retry</button></article>'; grid.querySelector('[data-pricing-retry]')?.addEventListener('click',load); };
  async function load(){grid.setAttribute('aria-busy','true');try{const r=await fetch('/api/billing/plans',{credentials:'same-origin',headers:{accept:'application/json'}});if(!r.ok)throw new Error('pricing');const j=await r.json();const plans=Array.isArray(j.plans)?j.plans:[];if(!plans.length)throw new Error('empty');grid.innerHTML=plans.map(card).join('');grid.setAttribute('aria-busy','false')}catch{fail()}}
  void load();
})();