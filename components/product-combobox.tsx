'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn, formatSoles } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ProductOption = {
  id: number;
  name: string;
  code: string;
  unitPrice: string | number;
};

type ProductComboboxProps = {
  products: ProductOption[];
  value: number;
  onSelect: (productId: number, unitPrice: number) => void;
  placeholder?: string;
  className?: string;
};

export function ProductCombobox({
  products,
  value,
  onSelect,
  placeholder = 'Buscar producto...',
  className,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal h-8 text-xs sm:h-9 sm:text-sm',
            className
          )}
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,320px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Escribe el nombre del producto..." />
          <CommandList>
            <CommandEmpty>No hay productos con ese nombre.</CommandEmpty>
            <CommandGroup>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.code}`}
                  onSelect={() => {
                    onSelect(product.id, parseFloat(String(product.unitPrice)) || 0);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === product.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex-1 truncate">{product.name}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {formatSoles(product.unitPrice)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
