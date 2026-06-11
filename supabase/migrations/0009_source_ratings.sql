-- Source-site ratings (stars) scraped at import time. Kept separate from
-- products.rating / review_count, which cache *local* approved reviews — the
-- storefront displays local ratings when they exist, else the source rating.
ALTER TABLE products
  ADD COLUMN source_rating numeric(3,1),
  ADD COLUMN source_review_count integer;
