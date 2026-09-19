(() => {
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
