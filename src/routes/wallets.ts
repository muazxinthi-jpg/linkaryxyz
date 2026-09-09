import type { Env } from '../env';
import { json } from '../http';
import { listProfileWalletDestinations as listOwnWallets } from './walletsOriginal';
import { buildWalletPortfolio } from './walletPortfolio';
import { searchWalletRecipients } from './walletRecipients';

export * from './walletsOriginal';

export async function listProfileWalletDestinations(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const recipientSearch = url.searchParams.get('recipientSearch');
  if (recipientSearch !== null) {
    url.searchParams.set('q', recipientSearch);
    return searchWalletRecipients(new Request(url.toString(), request), env);
  }

  const response = await listOwnWallets(request, env);
  if (url.searchParams.get('includePortfolio') !== '1' || !response.ok) return response;

  const payload = await response.clone().json() as {
    destinations?: Array<{ chain_family: string; address: string }>;
    embeddedWallets?: Array<{ chain_family: string; address: string }>;
    [key: string]: unknown;
  };
  const portfolio = await buildWalletPortfolio(
    env,
    Array.isArray(payload.embeddedWallets) ? payload.embeddedWallets : [],
    Array.isArray(payload.destinations) ? payload.destinations : [],
    url.searchParams.get('refreshPortfolio') === '1',
  );
  return json({ ...payload, portfolio });
}
