import type { Env } from '../env';
import { listProfileWalletDestinations as listOwnWallets } from './walletsOriginal';
import { searchWalletRecipients } from './walletRecipients';

export * from './walletsOriginal';

export async function listProfileWalletDestinations(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const recipientSearch = url.searchParams.get('recipientSearch');
  if (recipientSearch !== null) {
    url.searchParams.set('q', recipientSearch);
    return searchWalletRecipients(new Request(url.toString(), request), env);
  }
  return listOwnWallets(request, env);
}
