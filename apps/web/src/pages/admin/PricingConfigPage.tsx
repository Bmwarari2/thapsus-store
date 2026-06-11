import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import {
  apiAdminGetHsTaxCategories,
  apiAdminGetPricingConfig,
  apiAdminRepriceAll,
  apiAdminUpdateHsTaxCategory,
  apiAdminUpdatePricingConfig,
} from '../../lib/api';

// Keys that are clearly numeric settings; everything else edits as text.
const NUMERIC_HINT = /pct|rate|round|budget|max|days|min/;

export const PricingConfigPage = () => {
  const queryClient = useQueryClient();
  const [configEdits, setConfigEdits] = useState<Record<string, string>>({});
  const [hsEdits, setHsEdits] = useState<Record<string, { duty: string; vat: string; excise: string }>>({});
  const [message, setMessage] = useState('');

  const { data: config = [], isLoading: loadingConfig } = useQuery({
    queryKey: ['admin-pricing-config'],
    queryFn: apiAdminGetPricingConfig,
  });
  const { data: hsCategories = [], isLoading: loadingHs } = useQuery({
    queryKey: ['admin-hs-tax'],
    queryFn: apiAdminGetHsTaxCategories,
  });

  const { mutate: saveConfig, isPending: savingConfig } = useMutation({
    mutationFn: () => apiAdminUpdatePricingConfig(configEdits),
    onSuccess: (r) => {
      setConfigEdits({});
      setMessage(`Saved ${r.updated} setting${r.updated === 1 ? '' : 's'}. Run "Reprice all products" to apply to existing prices.`);
      queryClient.invalidateQueries({ queryKey: ['admin-pricing-config'] });
    },
  });

  const { mutate: saveHsRow, isPending: savingHs } = useMutation({
    mutationFn: (code: string) => {
      const e = hsEdits[code];
      return apiAdminUpdateHsTaxCategory(code, {
        dutyPct: Number(e.duty),
        vatPct: Number(e.vat),
        excisePct: Number(e.excise),
      });
    },
    onSuccess: (_r, code) => {
      setHsEdits(prev => { const next = { ...prev }; delete next[code]; return next; });
      setMessage('Tax band saved. Run "Reprice all products" to apply to existing prices.');
      queryClient.invalidateQueries({ queryKey: ['admin-hs-tax'] });
    },
  });

  const { mutate: repriceAll, isPending: repricing } = useMutation({
    mutationFn: apiAdminRepriceAll,
    onSuccess: (r) => setMessage(`Repriced ${r.updated} product${r.updated === 1 ? '' : 's'}.`),
  });

  const startHsEdit = (code: string) => {
    const row = hsCategories.find(h => h.code === code);
    if (!row) return;
    setHsEdits(prev => ({
      ...prev,
      [code]: { duty: row.duty_pct, vat: row.vat_pct, excise: row.excise_pct },
    }));
  };

  const inputCls = "border border-border rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Pricing Configuration</h1>
          <p className="text-textSecondary text-sm mt-1">
            Exchange rates, markup, levies, and per-HS-band taxes that build every product price.
          </p>
        </div>
        <Button variant="outline" onClick={() => repriceAll()} isLoading={repricing} className="gap-2">
          <RefreshCw size={15} /> {repricing ? 'Repricing…' : 'Reprice all products'}
        </Button>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3 mb-6">
          {message}
        </div>
      )}

      {/* Global config */}
      <div className="bg-white rounded-2xl border border-border p-6 mb-8">
        <h2 className="font-bold text-lg mb-4">Global settings</h2>
        {loadingConfig ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-textSecondary" /></div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {config.map(row => (
                <div key={row.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={row.key}>{row.label ?? row.key}</p>
                    <p className="text-xs text-textSecondary">{row.key}</p>
                  </div>
                  <input
                    type={NUMERIC_HINT.test(row.key) ? 'number' : 'text'}
                    step="any"
                    value={configEdits[row.key] ?? row.value}
                    onChange={e => setConfigEdits(prev => ({ ...prev, [row.key]: e.target.value }))}
                    className={`${inputCls} ${configEdits[row.key] != null && configEdits[row.key] !== row.value ? 'border-primary' : ''} w-36 shrink-0`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-5">
              <Button
                onClick={() => saveConfig()}
                disabled={Object.keys(configEdits).length === 0}
                isLoading={savingConfig}
                className="gap-2"
              >
                <Save size={15} /> {savingConfig ? 'Saving…' : `Save changes${Object.keys(configEdits).length ? ` (${Object.keys(configEdits).length})` : ''}`}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* HS tax bands */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-bold text-lg">Import tax bands (HS categories)</h2>
          <p className="text-textSecondary text-xs mt-1">
            Duty/excise/VAT applied per product type. Verify against the current EAC CET / Finance Act.
          </p>
        </div>
        {loadingHs ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-textSecondary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-textSecondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Band</th>
                  <th className="text-right px-4 py-3">Duty %</th>
                  <th className="text-right px-4 py-3">Excise %</th>
                  <th className="text-right px-4 py-3">VAT %</th>
                  <th className="text-right px-4 py-3">Pinned</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hsCategories.map(h => {
                  const edit = hsEdits[h.code];
                  return (
                    <tr key={h.code} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{h.name}</p>
                        <p className="text-xs text-textSecondary">HS {h.code}{h.notes ? ` — ${h.notes}` : ''}</p>
                      </td>
                      {edit ? (
                        <>
                          <td className="px-4 py-3 text-right">
                            <input type="number" step="0.01" min="0" value={edit.duty} onChange={e => setHsEdits(p => ({ ...p, [h.code]: { ...edit, duty: e.target.value } }))} className={inputCls} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input type="number" step="0.01" min="0" value={edit.excise} onChange={e => setHsEdits(p => ({ ...p, [h.code]: { ...edit, excise: e.target.value } }))} className={inputCls} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input type="number" step="0.01" min="0" value={edit.vat} onChange={e => setHsEdits(p => ({ ...p, [h.code]: { ...edit, vat: e.target.value } }))} className={inputCls} />
                          </td>
                          <td className="px-4 py-3 text-right text-textSecondary">{h.products_pinned}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <Button size="sm" onClick={() => saveHsRow(h.code)} isLoading={savingHs}>Save</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right">{Number(h.duty_pct)}%</td>
                          <td className="px-4 py-3 text-right">{Number(h.excise_pct)}%</td>
                          <td className="px-4 py-3 text-right">{Number(h.vat_pct)}%</td>
                          <td className="px-4 py-3 text-right text-textSecondary">{h.products_pinned}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => startHsEdit(h.code)} className="text-primary text-xs font-semibold hover:underline">Edit</button>
                          </td>
                        </>
                      )}
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
