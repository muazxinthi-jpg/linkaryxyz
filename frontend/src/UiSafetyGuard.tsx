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

export default function UiSafetyGuard() {
  useEffect(() => {
    sanitizeText(document);
    const observer = new MutationObserver(() => sanitizeText(document));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
