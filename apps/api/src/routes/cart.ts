import { Router } from "express";
import { AddToCartSchema, UpdateCartItemSchema } from "@thapsus/shared";
import { envelope, errorEnvelope, requireAuth } from "../middleware.js";
import * as cart from "../repos/cart.js";
import * as products from "../repos/products.js";

const r = Router();

r.use(requireAuth);

r.get("/", async (req, res) => {
  const result = await cart.getCartWithItems(req.user!.id);
  return res.json(envelope(result));
});

r.post("/items", async (req, res) => {
  const parsed = AddToCartSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }
  const { productId, variantId, qty } = parsed.data;

  // Look up current price
  const product = await products.findById(productId);
  if (!product || !product.isActive) {
    return res.status(404).json(errorEnvelope("not_found", "Product not found"));
  }

  let priceSnapshot = product.sellPriceKesCents;
  if (variantId) {
    const variants = await products.getVariants(productId);
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) return res.status(404).json(errorEnvelope("not_found", "Variant not found"));
    priceSnapshot += variant.priceDeltaKesCents;
  }

  const item = await cart.addItem(req.user!.id, productId, variantId ?? null, qty, priceSnapshot);
  return res.status(201).json(envelope(item));
});

r.patch("/items/:id", async (req, res) => {
  const parsed = UpdateCartItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorEnvelope("validation", "Invalid input", parsed.error.flatten()));
  }

  const item = await cart.updateItem(req.user!.id, req.params.id, parsed.data.qty);
  if (!item) return res.status(404).json(errorEnvelope("not_found", "Cart item not found"));
  return res.json(envelope(item));
});

r.delete("/items/:id", async (req, res) => {
  const removed = await cart.removeItem(req.user!.id, req.params.id);
  if (!removed) return res.status(404).json(errorEnvelope("not_found", "Cart item not found"));
  return res.json(envelope({ removed: true }));
});

r.delete("/", async (req, res) => {
  await cart.clearCart(req.user!.id);
  return res.json(envelope({ cleared: true }));
});

r.post("/merge", async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items)) {
    return res.status(400).json(errorEnvelope("validation", "items array required"));
  }
  await cart.mergeGuestCart(req.user!.id, items);
  const result = await cart.getCartWithItems(req.user!.id);
  return res.json(envelope(result));
});

export default r;
