import { useEffect } from 'react';

const replacements: Array<[string, string]> = [
  [
    'Run the production D1 migration to activate campaigns.',
    'Campaigns are temporarily unavailable. Please try again shortly.',
  ],
  [
    'Run the manual D1 migrations to activate tracking.',
    'Tracking is temporarily unavailable. Please try again shortly.',
  ],
  [
    'This Project must be active and X-verified before Linkary can operate campaigns or attribution.',
    'Verify this Project with its official X account to activate campaigns and tracking.',
  ],
];

const modalSelector = '.ops-modal';
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let modalTitleId = 0;

function sanitizeText(root: ParentNode) {
  const elements = root.querySelectorAll<HTMLElement>('.form-error, .notice.danger');
  for (const element of elements) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const original = node.nodeValue || '';
      let next = original;
      for (const [internal, safe] of replacements) next = next.replace(internal, safe);
      if (next !== original) node.nodeValue = next;
      node = walker.nextNode();
    }
  }
}

function decorateModal(modal: HTMLElement) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (!modal.hasAttribute('tabindex')) modal.tabIndex = -1;

  const heading = modal.querySelector<HTMLElement>('h1, h2, h3');
  if (heading && !modal.hasAttribute('aria-labelledby')) {
    if (!heading.id) {
      modalTitleId += 1;
      heading.id = `linkary-modal-title-${modalTitleId}`;
    }
    modal.setAttribute('aria-labelledby', heading.id);
  }

  const closeButton = modal.querySelector<HTMLButtonElement>('.ops-modal-head button');
  if (closeButton && !closeButton.getAttribute('aria-label')) closeButton.setAttribute('aria-label', 'Close dialog');
}

function visibleModals(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(modalSelector)).filter((modal) => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function focusableElements(modal: HTMLElement): HTMLElement[] {
  return Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export default function UiSafetyGuard() {
  useEffect(() => {
    let activeModal: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;

    const refresh = () => {
      sanitizeText(document);
      const modals = visibleModals();
      for (const modal of modals) decorateModal(modal);
      const nextModal = modals.at(-1) || null;

      if (nextModal && nextModal !== activeModal) {
        if (!activeModal) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        activeModal = nextModal;
        queueMicrotask(() => {
          if (!activeModal?.isConnected) return;
          const target = activeModal.querySelector<HTMLElement>('[autofocus]') || focusableElements(activeModal)[0] || activeModal;
          target.focus({ preventScroll: true });
        });
      } else if (!nextModal && activeModal) {
        activeModal = null;
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
      } else {
        activeModal = nextModal;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const modal = activeModal && activeModal.isConnected ? activeModal : visibleModals().at(-1) || null;
      if (!modal) return;

      if (event.key === 'Escape') {
        const closeButton = modal.querySelector<HTMLButtonElement>('.ops-modal-head button, [data-modal-close]');
        if (closeButton && !closeButton.disabled) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }

      if (event.key !== 'Tab') return;
      const focusables = focusableElements(modal);
      if (!focusables.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !modal.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return null;
}
