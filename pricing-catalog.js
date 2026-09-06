(() => {
  const grid = document.getElementById('linkary-pricing-grid');
  if (!grid) return;

  const money = (cents, currency) => {
    if (cents === null || cents === undefined) return 'Custom';
    if (Number(cents) === 0) return '$0';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
      }).format(Number(cents) / 100);
    } catch {
      return `$${(Number(cents) / 100).toFixed(2)}`;
    }
  };

  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const render = (plans) => {
    grid.replaceChildren();

    plans.forEach((plan) => {
      const card = node('article', 'public-plan-card');
      card.dataset.plan = plan.code || '';
      card.appendChild(node('span', 'public-plan-audience', plan.audience || ''));
      card.appendChild(node('h3', '', plan.name || ''));

      const price = node('div', 'public-plan-price');
      const discounted = plan.basePriceCents !== null
        && plan.basePriceCents !== undefined
        && plan.effectivePriceCents !== null
        && plan.effectivePriceCents !== undefined
        && Number(plan.effectivePriceCents) < Number(plan.basePriceCents);

      if (discounted) price.appendChild(node('del', '', money(plan.basePriceCents, plan.currency)));
      price.appendChild(node('strong', '', money(plan.effectivePriceCents, plan.currency)));
      if (plan.billingPeriod === 'monthly') price.appendChild(node('span', '', '/ month'));
      card.appendChild(price);

      if (plan.promotion && plan.promotion.label) {
        card.appendChild(node('div', 'public-plan-promo', plan.promotion.label));
      }

      card.appendChild(node('p', '', plan.description || ''));

      const credits = node('div', 'public-plan-credits');
      credits.appendChild(node('strong', '', Number(plan.monthlyUsageCredits || 0).toLocaleString()));
      credits.appendChild(node('span', '', 'monthly Usage Credits'));
      card.appendChild(credits);

      const list = node('ul');
      (Array.isArray(plan.features) ? plan.features : []).slice(0, 6).forEach((feature) => {
        list.appendChild(node('li', '', feature));
      });
      card.appendChild(list);

      const ctaText = plan.code === 'free'
        ? 'Create free profile'
        : plan.billingPeriod === 'custom'
          ? 'Request Beta access'
          : 'Join Controlled Beta';
      const cta = node('a', '', ctaText);
      cta.href = '/app';
      card.appendChild(cta);
      grid.appendChild(card);
    });
  };

  const fail = () => {
    const error = node('article', 'public-pricing-loading');
    error.appendChild(node('strong', '', 'Pricing is temporarily unavailable.'));
    error.appendChild(document.createElement('br'));
    error.appendChild(node('span', '', 'Refresh the page to try again. Linkary tracking remains available.'));
    grid.replaceChildren(error);
  };

  fetch('/api/billing/plans', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  })
    .then((response) => {
      if (!response.ok) throw new Error('pricing_request_failed');
      return response.json();
    })
    .then((payload) => {
      const plans = Array.isArray(payload.plans) ? payload.plans : [];
      if (!plans.length) throw new Error('pricing_catalog_empty');
      render(plans);
    })
    .catch(fail);
})();
