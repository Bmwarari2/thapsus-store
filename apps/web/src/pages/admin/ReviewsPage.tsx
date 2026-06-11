import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Star, Check, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { apiAdminGetReviews, apiAdminModerateReview } from '../../lib/api';
import { formatDate } from '../../lib/utils';

export const ReviewsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', page],
    queryFn: () => apiAdminGetReviews(page),
  });

  const { mutate: moderate, isPending } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      apiAdminModerateReview(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Reviews Moderation</h1>
      <p className="text-textSecondary text-sm mb-6">
        {total} review{total === 1 ? '' : 's'} awaiting moderation. Approved reviews appear on the
        product page and feed its star rating.
      </p>

      {isLoading ? (
        <div className="p-12 flex justify-center"><Loader2 size={24} className="animate-spin text-textSecondary" /></div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-textSecondary text-sm">
          No pending reviews. New customer reviews will appear here for approval.
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(r => (
            <div key={r.id} className="bg-white rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center text-yellow-400">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} size={15} className={s <= r.rating ? 'fill-current' : 'fill-current opacity-20'} />
                  ))}
                  <span className="text-xs text-textSecondary ml-2">{formatDate(r.createdAt)}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" onClick={() => moderate({ id: r.id, status: 'approved' })} disabled={isPending} className="gap-1.5">
                    <Check size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => moderate({ id: r.id, status: 'rejected' })} disabled={isPending} className="gap-1.5">
                    <X size={14} /> Reject
                  </Button>
                </div>
              </div>
              {r.title && <p className="font-semibold text-sm mb-1">{r.title}</p>}
              {r.body && <p className="text-sm text-textSecondary">{r.body}</p>}
              {r.images.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {r.images.map((img, i) => (
                    <img key={i} src={img} alt="" className="w-16 h-16 rounded-lg object-cover bg-surface" loading="lazy" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <span className="text-textSecondary">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};
