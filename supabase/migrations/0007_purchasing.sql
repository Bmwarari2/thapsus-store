-- Admin purchasing workflow: after a customer pays, each order line must be
-- bought from its source site (SHEIN / AliExpress / Amazon). Track per-line
-- purchase state so the admin's rolling report can tick items off.

ALTER TABLE order_items
  ADD COLUMN purchased_at timestamptz,
  ADD COLUMN purchased_by uuid REFERENCES users(id);

CREATE INDEX idx_order_items_unpurchased
  ON order_items (order_id) WHERE purchased_at IS NULL;
