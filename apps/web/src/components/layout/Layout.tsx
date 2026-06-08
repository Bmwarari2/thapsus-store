import React from 'react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { CartDrawer } from '../cart/CartDrawer';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Header />
      <main className="flex-1 pb-16 md:pb-0">
        {children}
      </main>
      <BottomNav />
      <CartDrawer />
      {/* Footer can go here for desktop */}
    </div>
  );
};
