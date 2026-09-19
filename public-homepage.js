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
          && /^\/assets\/homepage\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|avif)$/i.test(item.src)
          && typeof item.alt === 'string' && item.alt.trim());
        if (safeSlides.length < 1) return;
        slides = safeSlides;
        show(0);
        if (slides.length < 2) {
          controls.hidden = true;
          return;
        }
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
        startTimer();
      })
      .catch(() => { /* Keep the local fallback photo if a manifest is unavailable. */ });
  }

  async function setupCommunityProof() {
    const root = document.querySelector('[data-community-proof]');
    if (!root) return;
    try {
      const response = await fetch('/api/public/homepage-community', { credentials: 'omit', headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      const metrics = payload && payload.metrics;
      if (!metrics) return;
      for (const key of ['registeredMembers', 'projects', 'walletsSubmitted']) {
        const value = metrics[key];
        if (!Number.isSafeInteger(value) || value < 0) return;
        const node = root.querySelector('[data-stat="' + key + '"]');
        if (node) node.textContent = new Intl.NumberFormat('en').format(value);
      }
      const valueNode = root.querySelector('[data-stat="connectedValueUsd"]');
      if (valueNode) {
        const value = metrics.connectedValueUsd;
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          valueNode.textContent = '≈' + new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', maximumFractionDigits: 2,
          }).format(value);
          const updatedAt = typeof metrics.connectedValueUpdatedAt === 'string' ? metrics.connectedValueUpdatedAt : '';
          const partial = metrics.connectedValuePartial === true;
          valueNode.title = updatedAt
            ? 'Last updated ' + new Date(updatedAt).toLocaleString() + (partial ? '. Some supported wallet data was unavailable.' : '')
            : (partial ? 'Some supported wallet data was unavailable.' : '');
          valueNode.setAttribute('aria-label', 'Estimated connected value ' + valueNode.textContent.slice(1));
        } else {
          valueNode.textContent = 'Unavailable';
          valueNode.title = 'A priced aggregate is not available yet.';
        }
      }
      const list = root.querySelector('[data-community-supporters]');
      const people = root.querySelector('[data-community-people]');
      const supporters = Array.isArray(payload.supporters) ? payload.supporters : [];
      supporters.slice(0, 5).forEach((member) => {
        if (!member || typeof member.username !== 'string' || !/^[a-z0-9_-]{2,40}$/i.test(member.username)) return;
        const name = typeof member.displayName === 'string' && member.displayName.trim() ? member.displayName.trim() : member.username;
        const link = document.createElement('a');
        link.className = 'community-member';
        link.href = '/' + encodeURIComponent(member.username);
        link.setAttribute('aria-label', 'View ' + name + "'s public Linkary profile");
        const avatar = document.createElement('span');
        avatar.className = 'community-member-avatar';
        if (typeof member.avatarUrl === 'string') {
          try {
            const imageUrl = new URL(member.avatarUrl);
            if (imageUrl.protocol === 'https:') {
              const image = document.createElement('img');
              image.src = imageUrl.href;
              image.alt = '';
              image.loading = 'lazy';
              image.decoding = 'async';
              avatar.append(image);
            }
          } catch { /* Use the public creator's initials when an image URL is unavailable. */ }
        }
        if (!avatar.firstChild) {
          avatar.textContent = Array.from(name.trim())[0]?.toUpperCase() || '?';
          avatar.setAttribute('aria-hidden', 'true');
        }
        link.append(avatar);
        const item = document.createElement('li');
        item.append(link);
        list.append(item);
      });
      if (list.children.length) people.hidden = false;
      root.hidden = false;
    } catch { /* Keep the hero intact if public aggregate data is temporarily unavailable. */ }
  }

  setupCarousel();
  void setupCommunityProof();
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
