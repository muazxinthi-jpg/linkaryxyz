(() => {
  const grid = document.querySelector('[data-pricing-grid]');
  if (!grid) return;

  const money = (cents) => {
    if (cents === null || cents === undefined) return 'Custom';
    return `$${(Number(cents) / 100).toFixed(2)}`;
  };

  const seats = (value) => {
    if (value === null || value === undefined) return 'Custom';
    if (Number(value) === 0) return 'Personal';
    return Number(value).toLocaleString();
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const priceMarkup = (plan) => {
    if (plan.basePriceCents === null) {
      return '<div class="pricing-price"><strong>Custom</strong></div>';
    }
    const hasPromotion = plan.promotion && plan.effectivePriceCents !== null && plan.effectivePriceCents < plan.basePriceCents;
    if (!hasPromotion) {
      return `<div class="pricing-price"><strong>${money(plan.basePriceCents)}</strong>${plan.billingPeriod === 'monthly' ? '<span>/ month</span>' : ''}</div>`;
    }
    return `<div class="pricing-price"><strong>${money(plan.effectivePriceCents)}</strong><span class="pricing-original">${money(plan.basePriceCents)}</span>${plan.billingPeriod === 'monthly' ? '<span>/ month</span>' : ''}</div><p class="pricing-promo">${escapeHtml(plan.promotion.label)}</p>`;
  };

  const card = (plan) => {
    const featured = plan.code === 'project_automate';
    const features = Array.isArray(plan.features) ? plan.features.slice(0, 5) : [];
    const cta = plan.code === 'free' ? 'Create profile' : plan.code === 'scale' ? 'Request Beta access' : 'Join Controlled Beta';
    return `<article class="pricing-card${featured ? ' featured' : ''}">
      <div class="pricing-card-top"><div><span class="pricing-card-kicker">${escapeHtml(plan.audience)}</span><h3>${escapeHtml(plan.name)}</h3></div>${featured ? '<span class="pricing-card-badge">Popular</span>' : ''}</div>
      <p class="pricing-card-audience">${escapeHtml(plan.description)}</p>
      ${priceMarkup(plan)}
      <div class="pricing-allowance"><span><small>USAGE CREDITS</small><b>${Number(plan.monthlyUsageCredits || 0).toLocaleString()} / month</b></span><span><small>PROJECT SEATS</small><b>${seats(plan.projectSeatLimit)}</b></span></div>
      <ul class="pricing-features">${features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
      <a class="pricing-cta" href="/app">${cta} →</a>
    </article>`;
  };

  const renderError = () => {
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '<div class="pricing-error"><strong>Pricing could not be loaded.</strong><span>The rest of Linkary is still available. Refresh pricing when you are ready.</span><br><button class="btn outline small" type="button" data-pricing-retry>Retry</button></div>';
    grid.querySelector('[data-pricing-retry]')?.addEventListener('click', load);
  };

  async function load() {
    grid.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/billing/plans', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('pricing_request_failed');
      const payload = await response.json();
      const plans = Array.isArray(payload.plans) ? payload.plans : [];
      if (!plans.length) throw new Error('pricing_catalog_empty');
      grid.innerHTML = plans.map(card).join('');
      grid.setAttribute('aria-busy', 'false');
    } catch {
      renderError();
    }
  }

  void load();
})();
