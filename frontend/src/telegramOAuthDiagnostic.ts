// Temporary, console-only diagnostics. Never pass SDK responses, request data or stacks.
export type TelegramOAuthSnapshot = {
  status?: unknown;
  error?: unknown;
  errorDescription?: unknown;
};

type Stage = 'telegram_link_clicked' | 'cdp_link_started' | 'cdp_link_returned'
  | 'cdp_link_error' | 'current_link_sync_started' | 'current_link_sync_success'
  | 'current_link_sync_failed';

export function safeDiagnosticText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Fail closed on credential-bearing text, including encoded query parameters.
  let text = value;
  try { text = decodeURIComponent(text); } catch { /* Keep malformed provider text. */ }
  if (/(?:token|api[\s_-]*key|secret|cookie|authorization|bearer|\botp\b|one[\s_-]*time|verification[\s_-]*code|password|private[\s_-]*key)/i.test(text)) {
    return '[redacted sensitive diagnostic text]';
  }
  return text
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .replace(/(?:[?&#]|\b)(?:code|state|session)["']?\s*[=:]\s*\S+/gi, '[redacted OAuth parameter]')
    .replace(/\b\d{4,}\b/g, '[redacted number]')
    .replace(/[A-Za-z0-9_+/.=-]{24,}/g, '[redacted opaque value]')
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 600);
}

export function telegramOAuthDiagnostic(stage: Stage, state?: TelegramOAuthSnapshot | null, caught?: unknown) {
  // Diagnostics must never change the linking flow, even if console is unavailable.
  try {
    const diagnostic = {
      stage,
      oauthState: {
        status: safeDiagnosticText(state?.status),
        error: safeDiagnosticText(state?.error),
        errorDescription: safeDiagnosticText(state?.errorDescription),
      },
      caughtError: {
        name: safeDiagnosticText(caught instanceof Error ? caught.name : null),
        message: safeDiagnosticText(caught instanceof Error ? caught.message : null),
      },
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
    };
    const prefix = '[Linkary Telegram OAuth Diagnostic]';
    if (stage === 'cdp_link_error' || stage === 'current_link_sync_failed') {
      console.error(prefix, diagnostic);
    } else {
      console.info(prefix, diagnostic);
    }
  } catch { /* Observability is best-effort only. */ }
}
