(() => {
  const menuButton = document.querySelector('.menu-button');
  const mobileNav = document.getElementById('mobile-nav');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    if (mobileNav) mobileNav.hidden = open;
  });
  mobileNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    if (mobileNav) mobileNav.hidden = true;
    menuButton?.setAttribute('aria-expanded', 'false');
  }));

  const slides = [...document.querySelectorAll('.feed-slide')];
  const bars = [...document.querySelectorAll('.progress i')];
  const title = document.getElementById('feed-title');
  const evidence = document.getElementById('float-evidence');
  const source = document.getElementById('float-source');
  const outcome = document.getElementById('float-outcome');
  const confidence = document.getElementById('float-confidence');
  const pause = document.getElementById('pause-feed');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let index = 0;
  let paused = Boolean(reduceMotion);
  let timer;

  function render(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
    bars.forEach((bar, i) => bar.classList.toggle('active', i === index));
    const slide = slides[index];
    if (!slide) return;
    if (title) title.textContent = slide.querySelector('h3')?.textContent || 'Live attribution';
    if (evidence) evidence.textContent = slide.dataset.evidence || '—';
    if (source) source.textContent = slide.dataset.source || '—';
    if (outcome) outcome.textContent = slide.dataset.outcome || '—';
    if (confidence) confidence.textContent = slide.dataset.confidence || '—';
  }

  function stop() { if (timer) window.clearInterval(timer); timer = undefined; }
  function start() { stop(); if (!paused && slides.length > 1) timer = window.setInterval(() => render(index + 1), 5200); }

  document.getElementById('prev-feed')?.addEventListener('click', () => { render(index - 1); start(); });
  document.getElementById('next-feed')?.addEventListener('click', () => { render(index + 1); start(); });
  pause?.addEventListener('click', () => {
    paused = !paused;
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? 'Resume motion' : 'Pause motion';
    start();
  });

  render(0);
  start();
})();