import React from 'react';
import { formatKes } from '../../lib/utils';

interface PriceDisplayProps {
  sellPriceKesCents: number;
  /** Strike-through compare-at price (e.g. the source's list price). */
  compareAtKesCents?: number | null;
  size?: 'md' | 'lg';
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
  sellPriceKesCents,
  compareAtKesCents,
  size = 'md',
}) => {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-bold text-primary ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}>
        {formatKes(sellPriceKesCents)}
      </span>
      {compareAtKesCents != null && compareAtKesCents > sellPriceKesCents && (
        <span className="text-sm text-textSecondary line-through">
          {formatKes(compareAtKesCents)}
        </span>
      )}
    </div>
  );
};
