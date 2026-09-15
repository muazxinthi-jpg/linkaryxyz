export async function refinePublicProfilePromotionLayout(response: Response): Promise<Response> {
  // The delivery layer now owns one structural header shell. Keep this pass as a
  // compatibility boundary for the worker chain, but never append competing CSS.
  return response;
}
