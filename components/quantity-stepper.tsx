'use client';

import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type QuantityStepperProps = {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  className?: string;
  blockClassName?: string;
  borderClassName?: string;
  compact?: boolean;
  labelClassName?: string;
};

function parsePositiveInt(value: string): number | null {
  if (value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999999,
  className,
  blockClassName = 'w-[110px]',
  borderClassName = 'border-border',
  compact = false,
  labelClassName,
}: QuantityStepperProps) {
  const numeric = parsePositiveInt(value) ?? min;

  const increment = () => onChange(String(Math.min(max, numeric + 1)));
  const decrement = () => onChange(String(Math.max(min, numeric - 1)));

  return (
    <div className={cn('shrink-0', blockClassName, className)}>
      <p
        className={cn(
          'text-xs text-muted-foreground mb-1 block',
          labelClassName
        )}
      >
        Cantidad
      </p>
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-md border bg-background',
          compact ? 'h-[58px]' : 'h-[76px]',
          borderClassName
        )}
      >
        <button
          type="button"
          aria-label="Aumentar cantidad"
          className={cn(
            'flex shrink-0 items-center justify-center border-b hover:bg-muted/80 transition-colors',
            compact ? 'h-[18px]' : 'h-[22px]',
            borderClassName
          )}
          onClick={increment}
        >
          <ChevronUpIcon className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 min-h-[28px] items-center justify-center px-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Cantidad"
            className={cn(
              'w-full bg-transparent text-center font-semibold outline-none focus:ring-1 focus:ring-ring rounded',
              compact ? 'h-6 text-xs' : 'h-8 text-sm'
            )}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
            onBlur={() => {
              if (value === '' || parsePositiveInt(value) === null) {
                onChange(String(min));
              }
            }}
          />
        </div>
        <button
          type="button"
          aria-label="Disminuir cantidad"
          className={cn(
            'flex shrink-0 items-center justify-center border-t hover:bg-muted/80 transition-colors disabled:opacity-40',
            compact ? 'h-[18px]' : 'h-[22px]',
            borderClassName
          )}
          onClick={decrement}
          disabled={numeric <= min}
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
