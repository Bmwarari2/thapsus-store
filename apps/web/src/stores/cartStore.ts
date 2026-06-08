import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartState {
  guestCartId: string | null;
  itemCount: number;
  setItemCount: (n: number) => void;
  setGuestCartId: (id: string | null) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      guestCartId: null,
      itemCount: 0,
      setItemCount: (itemCount) => set({ itemCount }),
      setGuestCartId: (guestCartId) => set({ guestCartId }),
    }),
    {
      name: 'thapsus-cart',
    }
  )
);
