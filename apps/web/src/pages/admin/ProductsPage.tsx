import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { formatKes, imageAtWidth } from '../../lib/utils';
import {
  apiAdminDeleteProduct,
  apiAdminGetProducts,
  apiAdminRepriceAll,
  apiAdminUpdateProduct,
  apiGetCategories,
  type AdminProduct,
  type AdminProductUpdate,
} from '../../lib/api';

const PAGE_SIZE = 25;

const PLATFORM_LABEL: Record<string, string> = {
  aliexpress: 'AliExpress',
  shein: 'Shein',
  amazon: 'Amazon',
  manual: 'Manual',
};

/** Source cost in the source currency, e.g. "£9.99" / "$12.50". */
function formatSourcePrice(p: AdminProduct) {
  const symbol = p.sourceCurrency === 'GBP' ? '£' : '$';
  return `${symbol}${(p.sourcePriceUsdCents / 100).toFixed(2)}`;
}

interface EditForm {
  name: string;
  description: string;
  categoryId: string;
  sourcePrice: string; // major units, edited as text
  markupPct: string;
  weightGrams: string;
  isActive: boolean;
}

const EditModal = ({ product, onClose }: { product: AdminProduct; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditForm>({
    name: product.name,
    description: product.description ?? '',
    categoryId: product.categoryId ?? '',
    sourcePrice: (product.sourcePriceUsdCents / 100).toFixed(2),
    markupPct: String(product.markupPct),
    weightGrams: String(product.weightGrams),
    isActive: product.isActive,
  });
  const [error, setError] = useState('');

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: apiGetCategories });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (body: AdminProductUpdate) => apiAdminUpdateProduct(product.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      onClose();
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      setError(err.response?.data?.error?.message ?? 'Failed to save product');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const sourcePriceUsdCents = Math.round(Number(form.sourcePrice) * 100);
    const markupPct = Number(form.markupPct);
    const weightGrams = Number(form.weightGrams);
    if (!form.name.trim() || form.name.trim().length < 3) return setError('Name must be at least 3 characters');
    if (!Number.isFinite(sourcePriceUsdCents) || sourcePriceUsdCents < 0) return setError('Source price must be a positive number');
    if (!Number.isFinite(markupPct) || markupPct < 0 || markupPct > 500) return setError('Markup must be between 0 and 500%');
    if (!Number.isInteger(weightGrams) || weightGrams < 1) return setError('Weight must be a positive whole number of grams');

    // Only send what changed — an untouched source price/markup shouldn't
    // trigger a server-side reprice of the row.
    const body: AdminProductUpdate = {};
    if (form.name.trim() !== product.name) body.name = form.name.trim();
    if (form.description !== (product.description ?? '')) body.description = form.description;
    if (form.categoryId && form.categoryId !== product.categoryId) body.categoryId = form.categoryId;
    if (sourcePriceUsdCents !== product.sourcePriceUsdCents) body.sourcePriceUsdCents = sourcePriceUsdCents;
    if (markupPct !== product.markupPct) body.markupPct = markupPct;
    if (weightGrams !== product.weightGrams) body.weightGrams = weightGrams;
    if (form.isActive !== product.isActive) body.isActive = form.isActive;
    if (Object.keys(body).length === 0) return onClose();
    save(body);
  };

  const field = "w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const label = "block text-sm font-medium text-textSecondary mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-white">
          <h2 className="font-bold text-lg">Edit Product</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-lg text-textSecondary">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={label}>Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={field} />
          </div>

          <div>
            <label className={label}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className={field}
            />
          </div>

          <div>
            <label className={label}>Category</label>
            <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className={`${field} bg-white`}>
              <option value="">— Uncategorised —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.parentId ? `  ↳ ${c.name}` : c.name}</option>
              ))}
            </select>
            <p className="text-xs text-textSecondary mt-1">Category drives the HS tax band — re-run “Reprice all” after changing it.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Source price ({product.sourceCurrency === 'GBP' ? '£' : '$'})</label>
              <input type="number" step="0.01" min="0" value={form.sourcePrice} onChange={e => setForm(f => ({ ...f, sourcePrice: e.target.value }))} className={field} />
            </div>
            <div>
              <label className={label}>Markup %</label>
              <input type="number" step="0.1" min="0" max="500" value={form.markupPct} onChange={e => setForm(f => ({ ...f, markupPct: e.target.value }))} className={field} />
            </div>
            <div>
              <label className={label}>Weight (g)</label>
              <input type="number" step="1" min="1" value={form.weightGrams} onChange={e => setForm(f => ({ ...f, weightGrams: e.target.value }))} className={field} />
            </div>
          </div>
          <p className="text-xs text-textSecondary">
            Current sell price: <span className="font-semibold text-textPrimary">{formatKes(product.sellPriceKesCents)}</span>.
            Changing source price or markup recalculates it automatically.
          </p>

          <label className="flex items-center gap-3 py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm font-medium">Visible in store</span>
          </label>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-2"><AlertCircle size={14} /> {error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isPending}>{isPending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ProductsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: apiGetCategories });
  const categoryName = (id: string) => categories.find(c => c.id === id)?.name ?? '—';

  const { data, isLoading } = useQuery({
    queryKey: ['admin-products', page, submittedSearch, categorySlug, showInactive],
    queryFn: () =>
      apiAdminGetProducts({
        page,
        limit: PAGE_SIZE,
        q: submittedSearch || undefined,
        category: categorySlug || undefined,
        active: showInactive ? 'all' : undefined,
      }),
  });

  const { mutate: repriceAll, isPending: isRepricing } = useMutation({
    mutationFn: apiAdminRepriceAll,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-products'] }),
  });

  const { mutate: deleteProduct } = useMutation({
    mutationFn: apiAdminDeleteProduct,
    onSuccess: (r) => {
      toast.success(r.deleted
        ? 'Product permanently deleted.'
        : 'Product has past orders, so it was hidden from the store instead (order history kept).');
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: () => toast.error('Failed to delete product.'),
  });

  const confirmDelete = (p: AdminProduct) => {
    if (window.confirm(`Delete "${p.name}"?\n\nThis permanently removes it (or hides it if it has past orders).`)) {
      deleteProduct(p.id);
    }
  };

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-textSecondary text-sm mt-1">{total} product{total === 1 ? '' : 's'} in the catalogue</p>
        </div>
        <Button variant="outline" onClick={() => repriceAll()} isLoading={isRepricing} className="gap-2">
          <RefreshCw size={15} />
          {isRepricing ? 'Repricing…' : 'Reprice all'}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textSecondary" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products… (press Enter)"
            className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
        <select
          value={categorySlug}
          onChange={e => { setCategorySlug(e.target.value); setPage(1); }}
          className="border border-border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-textSecondary cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => { setShowInactive(e.target.checked); setPage(1); }}
            className="w-4 h-4 accent-primary"
          />
          Show hidden
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-textSecondary" />
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-textSecondary text-sm">
            No products match. Try a different search, or run an import.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-textSecondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-right px-4 py-3">Cost</th>
                  <th className="text-right px-4 py-3">Markup</th>
                  <th className="text-right px-4 py-3">Sell Price</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map(p => (
                  <tr key={p.id} className={`hover:bg-surface/50 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 max-w-xs">
                        {p.images[0] ? (
                          <img
                            src={imageAtWidth(p.images[0], 320)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover bg-surface shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface shrink-0" />
                        )}
                        <span className="font-medium truncate" title={p.name}>{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-textSecondary whitespace-nowrap">{categoryName(p.categoryId)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.sourceUrl ? (
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open on ${PLATFORM_LABEL[p.sourcePlatform ?? ''] ?? 'source site'}`}
                          className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
                        >
                          {PLATFORM_LABEL[p.sourcePlatform ?? ''] ?? 'Source'}
                          <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="text-textSecondary">{PLATFORM_LABEL[p.sourcePlatform ?? ''] ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-textSecondary whitespace-nowrap">{formatSourcePrice(p)}</td>
                    <td className="px-4 py-3 text-right text-textSecondary whitespace-nowrap">{p.markupPct}%</td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatKes(p.sellPriceKesCents)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                        p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {p.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(p)}
                        className="p-2 hover:bg-surface rounded-lg text-textSecondary hover:text-textPrimary transition-colors"
                        title="Edit product"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => confirmDelete(p)}
                        className="p-2 hover:bg-red-50 rounded-lg text-textSecondary hover:text-red-500 transition-colors"
                        title="Delete product"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border text-sm">
            <span className="text-textSecondary">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {editing && <EditModal product={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};
