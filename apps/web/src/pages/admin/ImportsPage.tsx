import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  apiGetImportJobs,
  apiCreateImportJob,
  apiGetCategories,
  type ImportJob,
} from '../../lib/api';

const PLATFORMS = [
  { value: 'aliexpress', label: 'AliExpress' },
  { value: 'shein',      label: 'Shein' },
  { value: 'amazon',     label: 'Amazon UK' },
] as const;

const STATUS_BADGE: Record<ImportJob['status'], { label: string; className: string; icon: React.ReactNode }> = {
  queued:  { label: 'Queued',  className: 'bg-yellow-100 text-yellow-700', icon: <Clock size={12} /> },
  running: { label: 'Running', className: 'bg-blue-100 text-blue-700',     icon: <Loader2 size={12} className="animate-spin" /> },
  done:    { label: 'Done',    className: 'bg-green-100 text-green-700',   icon: <CheckCircle size={12} /> },
  failed:  { label: 'Failed',  className: 'bg-red-100 text-red-700',       icon: <AlertCircle size={12} /> },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' });
}

function duration(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export const ImportsPage = () => {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<'aliexpress' | 'shein' | 'amazon'>('aliexpress');
  const [mode, setMode] = useState<'search' | 'url'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [maxProducts, setMaxProducts] = useState('');
  const [error, setError] = useState('');

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['admin-import-jobs'],
    queryFn: apiGetImportJobs,
    refetchInterval: 5000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: apiGetCategories,
  });

  const { mutate: createJob, isPending } = useMutation({
    mutationFn: apiCreateImportJob,
    onSuccess: () => {
      setSearchQuery('');
      setSourceUrl('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['admin-import-jobs'] });
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      setError(err.response?.data?.error?.message ?? 'Failed to create import job');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'search' && !searchQuery.trim()) {
      setError('Search query is required');
      return;
    }
    if (mode === 'url' && !sourceUrl.trim()) {
      setError('Product URL is required');
      return;
    }
    createJob({
      sourcePlatform: platform,
      searchQuery: mode === 'search' ? searchQuery.trim() : undefined,
      sourceUrl: mode === 'url' ? sourceUrl.trim() : undefined,
      categoryId: categoryId || undefined,
      maxProducts: mode === 'search' && maxProducts ? Number(maxProducts) : undefined,
    });
  };

  const activeJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running');

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Product Imports</h1>
          <p className="text-textSecondary text-sm mt-1">Scrape products from AliExpress, Shein, or Amazon UK into the catalogue</p>
        </div>
        {activeJobs.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-full font-medium">
            <Loader2 size={14} className="animate-spin" />
            {activeJobs.length} job{activeJobs.length > 1 ? 's' : ''} running
          </div>
        )}
      </div>

      {/* New Import Form */}
      <div className="bg-white rounded-2xl border border-border p-6 mb-8">
        <h2 className="font-bold text-lg mb-5">New Import Job</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-2">Platform</label>
            <div className="flex gap-3">
              {PLATFORMS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    platform === p.value
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-textSecondary hover:bg-surface'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode toggle */}
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-2">Import by</label>
            <div className="flex gap-3">
              {(['search', 'url'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-5 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                    mode === m
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-border text-textSecondary hover:bg-surface'
                  }`}
                >
                  {m === 'search' ? 'Search Query' : 'Product URL'}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          {mode === 'search' ? (
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-2">Search Query</label>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="e.g. women fashion dress, smartphone accessories"
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-textSecondary mt-1.5">Each result is fetched individually — expect 5–15 min total. Capped by the max-products setting and the daily scrape budget.</p>
              <div className="mt-3">
                <label className="block text-sm font-medium text-textSecondary mb-2">Max products <span className="text-gray-400">(optional, default 24)</span></label>
                <input
                  type="number"
                  min={1}
                  max={96}
                  value={maxProducts}
                  onChange={e => setMaxProducts(e.target.value)}
                  placeholder="24"
                  className="w-40 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-textSecondary mb-2">Product URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://www.aliexpress.com/item/..."
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-textSecondary mt-1.5">Imports a single product by direct URL.</p>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-textSecondary mb-2">Category <span className="text-gray-400">(optional)</span></label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              <option value="">— Uncategorised —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.parentId ? `  ↳ ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-500 flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <Button type="submit" isLoading={isPending} className="gap-2">
            <Play size={16} />
            {isPending ? 'Starting…' : 'Run Import'}
          </Button>
        </form>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-bold text-lg">Import History</h2>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-import-jobs'] })}
            className="p-2 hover:bg-surface rounded-lg transition-colors text-textSecondary"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {jobsLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 size={24} className="animate-spin text-textSecondary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-textSecondary text-sm">
            No import jobs yet. Run your first import above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-textSecondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-3">Platform</th>
                  <th className="text-left px-6 py-3">Query / URL</th>
                  <th className="text-left px-6 py-3">Category</th>
                  <th className="text-left px-6 py-3">Status</th>
                  <th className="text-left px-6 py-3">Products</th>
                  <th className="text-left px-6 py-3">Duration</th>
                  <th className="text-left px-6 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map(job => {
                  const badge = STATUS_BADGE[job.status];
                  return (
                    <tr key={job.id} className="hover:bg-surface/50 transition-colors">
                      <td className="px-6 py-4 font-semibold capitalize">{job.source_platform}</td>
                      <td className="px-6 py-4 max-w-xs">
                        <span className="truncate block text-textSecondary">
                          {job.search_query ?? job.source_url ?? '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-textSecondary">{job.category_name ?? '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                        {job.status === 'failed' && job.error_message && (
                          <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={job.error_message}>
                            {job.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {job.products_added != null ? (
                          <span>
                            <span className="font-bold text-primary">{job.products_added}</span>
                            <span className="text-textSecondary"> / {job.products_found}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4 text-textSecondary">
                        {duration(job.started_at, job.finished_at) ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-textSecondary">{formatDate(job.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
