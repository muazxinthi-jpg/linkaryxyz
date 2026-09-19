(() => {
  const grid = document.querySelector('[data-pricing-grid]');
  if (!grid) return;
  const signup = document.querySelector('.nav-actions a[href$="/signup"]')?.href || 'https://app.linkary.xyz/signup';
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };
  function money(cents, currency) {
    if (typeof cents !== 'number' || !Number.isFinite(cents) || cents < 0) throw new Error('Invalid price');
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currency || 'USD',
      minimumFractionDigits: cents === 0 ? 0 : 2, maximumFractionDigits: 2,
    }).format(cents / 100);
  }
  function card(plan) {
    if (!plan || typeof plan.name !== 'string' || !plan.name.trim()) throw new Error('Invalid plan');
    const article = node('article', 'pricing-card');
    article.dataset.plan = plan.code || '';
    article.append(node('span', 'pricing-audience', plan.audience || ''), node('h4', '', plan.name));
    const price = node('div', 'pricing-price');
    if (plan.billingPeriod === 'custom') {
      price.append(node('strong', '', 'Custom'));
    } else {
      if (!['free', 'monthly'].includes(plan.billingPeriod)) throw new Error('Invalid billing period');
      const effective = plan.effectivePriceCents ?? plan.basePriceCents;
      price.append(node('strong', '', money(effective, plan.currency)));
      if (plan.promotion && typeof plan.basePriceCents === 'number' && effective < plan.basePriceCents) {
        price.append(node('del', '', money(plan.basePriceCents, plan.currency)));
      }
      if (plan.billingPeriod === 'monthly') price.append(node('span', '', '/ month'));
    }
    article.append(price);
    const action = node('a', 'button', plan.code === 'free' ? 'Join Linkary free' : 'Join Controlled Beta');
    action.href = signup;
    article.append(action);
    return article;
  }
  function group(title, audience, plans) {
    const section = node('section', 'plan-group');
    section.dataset.audience = audience;
    const heading = node('h3', 'plan-group-title', title);
    heading.id = 'plans-' + audience;
    section.setAttribute('aria-labelledby', heading.id);
    const cards = node('div', 'plan-cards');
    plans.forEach((plan) => cards.append(card(plan)));
    section.append(heading, cards);
    return section;
  }
  function failure() {
    const state = node('div', 'pricing-loading');
    state.append(node('h3', '', 'Pricing is temporarily unavailable.'), node('p', '', 'Please try again. You can still join Linkary.'));
    const retry = node('button', 'button', 'Retry pricing');
    retry.type = 'button';
    retry.addEventListener('click', load);
    state.append(retry);
    grid.replaceChildren(state);
  }
  let pending = false;
  async function load() {
    if (pending) return;
    pending = true;
    grid.setAttribute('aria-busy', 'true');
    grid.querySelector('button')?.setAttribute('disabled', '');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/billing/plans', {
        credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Pricing unavailable');
      const payload = await response.json();
      const plans = Array.isArray(payload.plans) ? payload.plans : [];
      if (!plans.length || plans.some((plan) => !plan || typeof plan.code !== 'string')) throw new Error('Invalid catalog');
      const isPersonal = (plan) => plan.code === 'free' || plan.code === 'personal_pro';
      const personal = plans.filter(isPersonal);
      const projects = plans.filter((plan) => !isPersonal(plan));
      const content = document.createDocumentFragment();
      if (projects.length) content.append(group('Projects & teams', 'projects', projects));
      if (personal.length) content.append(group('Personal profiles', 'personal', personal));
      grid.replaceChildren(content);
    } catch {
      failure();
    } finally {
      window.clearTimeout(timeout);
      grid.setAttribute('aria-busy', 'false');
      pending = false;
    }
  }
  void load();
})();
