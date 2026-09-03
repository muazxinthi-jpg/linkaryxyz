# NFT artwork resolution

For `nft_item` profile blocks, Linkary treats the click destination and artwork source as separate fields.

- `url` is the visitor destination. Collection URLs and individual NFT URLs are allowed.
- `config.mediaUrl` is the NFT artwork source. It must identify the artwork itself, either as a direct HTTPS image or an individual NFT item source that Linkary can resolve.
- OpenSea item URLs are parsed for chain, contract and token ID, then resolved server-side with the configured Alchemy NFT metadata API.
- NFT rendering never falls back to the destination URL or marketplace Open Graph/social preview images.
- If artwork cannot be resolved, the public card uses the existing NFT placeholder rather than a marketplace preview card.
- NFT artwork remains rendered with `object-fit: contain` so the complete token artwork is visible.
