import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'sale' | 'new' | 'warning' | 'success';
}

export const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', children, ...props }) => {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
        {
          'bg-gray-100 text-gray-800': variant === 'default',
          'bg-secondary text-white': variant === 'sale',
          'bg-primary text-white': variant === 'new',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-success/10 text-success': variant === 'success',
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
