(() => {
  function setupCarousel() {
    const root = document.querySelector('[data-carousel]');
    if (!root) return;
    const image = root.querySelector('[data-carousel-image]');
    const controls = root.querySelector('[data-carousel-controls]');
    const previous = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    const toggle = root.querySelector('[data-carousel-toggle]');
    const status = root.querySelector('[data-carousel-status]');
    const interval = Math.max(4000, Number(root.dataset.interval) || 6500);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let slides = [{ src: image.src, alt: image.alt }];
    let index = 0;
    let timer;
    let paused = reducedMotion;
    let hovered = false;
    let focused = false;

    const clearTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = undefined;
    };
    function startTimer() {
      clearTimer();
      if (slides.length > 1 && !paused && !hovered && !focused && !document.hidden) {
        timer = window.setInterval(() => show(index + 1), interval);
      }
    }
    function show(value) {
      index = (value + slides.length) % slides.length;
      const slide = slides[index];
      if (image.src !== new URL(slide.src, window.location.href).href) {
        image.classList.add('is-changing');
        image.src = slide.src;
      }
      image.alt = slide.alt;
      status.textContent = (index + 1) + ' of ' + slides.length;
      root.querySelectorAll('[data-carousel-dot]').forEach((dot, dotIndex) => {
        if (dotIndex === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }
    function makeDot(i) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.dataset.carouselDot = String(i);
      dot.setAttribute('aria-label', 'Show photo ' + (i + 1) + ' of ' + slides.length);
      dot.addEventListener('click', () => { show(i); startTimer(); });
      return dot;
    }
    toggle.addEventListener('click', () => {
      paused = !paused;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.textContent = paused ? 'Resume rotation' : 'Pause rotation';
      toggle.setAttribute('aria-label', paused ? 'Resume automatic photo rotation' : 'Pause automatic photo rotation');
      startTimer();
    });
    previous.addEventListener('click', () => { show(index - 1); startTimer(); });
    next.addEventListener('click', () => { show(index + 1); startTimer(); });
    root.addEventListener('pointerenter', () => { hovered = true; clearTimer(); });
    root.addEventListener('pointerleave', () => { hovered = false; startTimer(); });
    root.addEventListener('focusin', () => { focused = true; clearTimer(); });
    root.addEventListener('focusout', (event) => {
      if (!root.contains(event.relatedTarget)) { focused = false; startTimer(); }
    });
    document.addEventListener('visibilitychange', startTimer);
    image.addEventListener('load', () => image.classList.remove('is-changing'));
    image.addEventListener('error', () => image.classList.remove('is-changing'));

    fetch(root.dataset.slides, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then((response) => { if (!response.ok) throw new Error('Hero photos unavailable'); return response.json(); })
      .then((items) => {
        if (!Array.isArray(items)) return;
        const safeSlides = items.filter((item) => item && typeof item.src === 'string'
          && /^\/assets\/homepage\/[a-z0-9/_-]+\.(?:png|jpe?g|webp)$/i.test(item.src)
          && typeof item.alt === 'string' && item.alt.trim());
        if (safeSlides.length < 2) return;
        slides = safeSlides;
        const dots = document.createElement('div');
        dots.className = 'carousel-dots';
        dots.setAttribute('role', 'group');
        dots.setAttribute('aria-label', 'Choose a hero photo');
        slides.forEach((slide, i) => dots.append(makeDot(i)));
        controls.insertBefore(dots, status);
        previous.disabled = false;
        next.disabled = false;
        controls.hidden = false;
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.textContent = paused ? 'Resume rotation' : 'Pause rotation';
        toggle.setAttribute('aria-label', paused ? 'Resume automatic photo rotation' : 'Pause automatic photo rotation');
        show(0);
        startTimer();
      })
      .catch(() => { /* Keep the local fallback photo if a manifest is unavailable. */ });
  }

  setupCarousel();
  const menuButton = document.querySelector('.menu-button');
  const mobileNav = document.getElementById('mobile-nav');
  if (menuButton && mobileNav) {
    menuButton.hidden = false;
    function closeMenu(restoreFocus) {
      mobileNav.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open navigation');
      if (restoreFocus) menuButton.focus();
    }
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      mobileNav.hidden = !open;
    });
    mobileNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !mobileNav.hidden) closeMenu(true);
    });
    document.addEventListener('click', (event) => {
      if (!mobileNav.hidden && !event.target.closest('.site-header')) closeMenu(false);
    });
    window.matchMedia('(min-width: 801px)').addEventListener('change', (event) => {
      if (event.matches) closeMenu(false);
    });
  }
  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
