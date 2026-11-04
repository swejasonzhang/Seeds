import type { ReactNode } from 'react';
import { Accordion as AccordionPrimitive, Dialog as DialogPrimitive, DropdownMenu as MenuPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { ChevronDownRegular, DismissRegular } from '@fluentui/react-icons';
import { cn } from './core';

// ---------------- Tooltip ----------------

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-lg bg-seed-950 px-2.5 py-1.5 text-xs font-semibold text-cream-50 shadow-lift data-[state=delayed-open]:animate-fade-in">
          {content}
          <TooltipPrimitive.Arrow className="fill-seed-950" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------- Dialog ----------------

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-seed-950/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-lift outline-none data-[state=open]:animate-pop-in sm:p-7',
            size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-xl font-extrabold text-seed-950">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-1 text-sm text-ink-500">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-500 hover:bg-cream-200 hover:text-ink-900" aria-label="Close">
              <DismissRegular />
            </DialogPrimitive.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------- Sheet (mobile navigation) ----------------

export function Sheet({ open, onOpenChange, children, title }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode; title: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-seed-950/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-y-auto bg-seed-950 py-4 shadow-lift outline-none data-[state=open]:animate-slide-in">
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------- Dropdown menu ----------------

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded-xl border border-cream-200 bg-white p-1 shadow-lift data-[state=open]:animate-pop-in">
          {children}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function MenuItem({ children, onSelect, icon, tone }: { children: ReactNode; onSelect: () => void; icon?: ReactNode; tone?: 'danger' }) {
  return (
    <MenuPrimitive.Item
      onSelect={onSelect}
      className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold outline-none data-[highlighted]:bg-seed-50', tone === 'danger' ? 'text-red-700' : 'text-ink-900')}
    >
      {icon && <span className="text-base text-ink-500">{icon}</span>}
      {children}
    </MenuPrimitive.Item>
  );
}

// ---------------- Popover ----------------

export function Popover({ open, onOpenChange, trigger, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; trigger: ReactNode; children: ReactNode }) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={6} className="z-50 rounded-2xl border border-cream-200 bg-white p-3 shadow-lift outline-none data-[state=open]:animate-pop-in">
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------- Accordion ----------------

export function Accordion({ items }: { items: { id: string; title: ReactNode; body: ReactNode }[] }) {
  return (
    <AccordionPrimitive.Root type="multiple" className="divide-y divide-cream-200">
      {items.map((it) => (
        <AccordionPrimitive.Item key={it.id} value={it.id}>
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-base font-bold text-ink-900 outline-none hover:bg-cream-50 focus-visible:bg-seed-50">
              {it.title}
              <ChevronDownRegular className="shrink-0 text-ink-500 transition-transform group-data-[state=open]:rotate-180" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden px-6 pb-5 text-ink-700 data-[state=open]:animate-fade-in">{it.body}</AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
