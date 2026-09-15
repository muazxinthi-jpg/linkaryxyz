-- Preserve the seller destination agreed when each auction starts.
ALTER TABLE profile_promotion_auctions ADD COLUMN seller_payout_wallet_address TEXT;

-- Existing auctions receive the current slot address once. New auctions always
-- write their own snapshot and never resolve the slot again during settlement.
UPDATE profile_promotion_auctions
   SET seller_payout_wallet_address = (
     SELECT payout_wallet_address FROM profile_promotion_slots s
      WHERE s.id = profile_promotion_auctions.slot_id
   )
 WHERE seller_payout_wallet_address IS NULL;
