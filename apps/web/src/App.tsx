import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/home/HomePage';
import { ProductDetailPage } from './pages/products/ProductDetailPage';
import { BrowsePage } from './pages/products/BrowsePage';
import { CategoriesPage } from './pages/products/CategoriesPage';
import { CheckoutPage } from './pages/checkout/CheckoutPage';
import { OrderConfirmationPage } from './pages/checkout/OrderConfirmationPage';
import { CartPage } from './pages/cart/CartPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AccountHub } from './pages/account/AccountHub';
import { OrderDetailPage } from './pages/account/OrderDetailPage';
import { AdminLayout } from './pages/admin/AdminLayout';

export default function App() {
  return (
    <Routes>
      {/* Admin Routes (No Customer Layout) */}
      <Route path="/admin/*" element={<AdminLayout />} />

      {/* Public / Customer Routes */}
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<BrowsePage />} />
            <Route path="/products/:slug" element={<ProductDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders/confirmation/:id" element={<OrderConfirmationPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/signup" element={<SignupPage />} />
            <Route path="/account/*" element={<AccountHub />} />
            <Route path="*" element={<div className="p-10 text-center">404 Not Found</div>} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}
