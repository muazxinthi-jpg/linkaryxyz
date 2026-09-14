# Bid Marketplace V1

The authenticated `/bids` workspace discovers existing sponsored-header auctions and routes bidders into the existing `/promotion-auction/:auctionId` flow.

Leaderboards:
- Current Active
- Top Bidders
- Top Winners
- Most Viewed (30-day aggregated public-profile views)
- Most Bid On

Public profile views are stored only as daily aggregate counts per profile. No visitor identity is stored by this feature.
