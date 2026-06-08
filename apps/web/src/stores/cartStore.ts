import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartState {
  itemCount: number;
  setItemCount: (n: number) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      itemCount: 0,
      setItemCount: (itemCount) => set({ itemCount }),
    }),
    { name: 'thapsus-cart' }
  )
);
