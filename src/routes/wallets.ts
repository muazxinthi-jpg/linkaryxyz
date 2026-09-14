import type { Env } from '../env';
import { json } from '../http';
import { listProfileWalletDestinations as listOwnWallets } from './walletsOriginal';
import { buildWalletPortfolio } from './walletPortfolio';
import { buildBaseWalletBalances } from './baseWalletBalances';
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
  if (!response.ok) return response;

  const includePortfolio = url.searchParams.get('includePortfolio') === '1';
  const includeBaseBalances = url.searchParams.get('includeBaseBalances') === '1';
  if (!includePortfolio && !includeBaseBalances) return response;

  const payload = await response.clone().json() as {
    destinations?: Array<{ chain_family: string; address: string }>;
    embeddedWallets?: Array<{ chain_family: string; address: string; is_primary?: number }>;
    [key: string]: unknown;
  };
  const embeddedWallets = Array.isArray(payload.embeddedWallets) ? payload.embeddedWallets : [];
  const destinations = Array.isArray(payload.destinations) ? payload.destinations : [];
  const primaryBaseWallet = embeddedWallets.find((wallet) => wallet.chain_family === 'evm' && wallet.is_primary === 1)
    || embeddedWallets.find((wallet) => wallet.chain_family === 'evm');

  const [portfolio, baseBalances] = await Promise.all([
    includePortfolio
      ? buildWalletPortfolio(env, embeddedWallets, destinations, url.searchParams.get('refreshPortfolio') === '1')
      : Promise.resolve(undefined),
    includeBaseBalances && primaryBaseWallet
      ? buildBaseWalletBalances(env, primaryBaseWallet.address, url.searchParams.get('refreshBaseBalances') === '1')
      : Promise.resolve(undefined),
  ]);

  return json({
    ...payload,
    ...(includePortfolio ? { portfolio } : {}),
    ...(includeBaseBalances ? { baseBalances: baseBalances || null } : {}),
  });
}
