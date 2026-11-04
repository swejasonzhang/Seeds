import type { ReactNode } from 'react';
import { Checkbox as CheckboxPrimitive, Select as SelectPrimitive, Switch as SwitchPrimitive, Tabs as TabsPrimitive } from 'radix-ui';
import { CheckmarkRegular, ChevronDownRegular, ChevronUpRegular } from '@fluentui/react-icons';
import { cn, controlClass, useField } from './core';

// ---------------- Select (never the browser default) ----------------

export interface Option<T extends string = string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = 'Choose…',
  size = 'md',
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  value: T | '' | undefined;
  onValueChange: (v: T) => void;
  options: readonly Option<T>[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const f = useField();
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={f?.id}
        aria-label={ariaLabel}
        aria-invalid={f?.invalid || undefined}
        aria-describedby={f?.describedBy}
        className={cn(
          controlClass,
          'flex items-center justify-between gap-2 text-left data-[placeholder]:text-ink-500/80',
          size === 'lg' ? 'h-12' : size === 'sm' ? 'h-9 rounded-lg px-3 text-sm' : 'h-10',
          className,
        )}
      >
        <span className="truncate"><SelectPrimitive.Value placeholder={placeholder} /></span>
        <SelectPrimitive.Icon className="text-ink-500"><ChevronDownRegular /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-cream-200 bg-white p-1 shadow-lift data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-ink-500"><ChevronUpRegular /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none flex-col rounded-lg py-2 pl-3 pr-8 text-sm text-ink-900 outline-none data-[highlighted]:bg-seed-50 data-[state=checked]:font-bold data-[state=checked]:text-seed-900"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.hint && <span className="text-xs font-normal text-ink-500">{o.hint}</span>}
                <SelectPrimitive.ItemIndicator className="absolute right-2.5 top-2.5 text-seed-600"><CheckmarkRegular /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-ink-500"><ChevronDownRegular /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ---------------- Checkbox ----------------

export function Checkbox({ checked, onCheckedChange, label, description, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60', className)}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 border-cream-300 bg-white outline-none transition hover:border-seed-400 focus-visible:ring-4 focus-visible:ring-seed-500/20 data-[state=checked]:border-seed-500 data-[state=checked]:bg-seed-500"
      >
        <CheckboxPrimitive.Indicator className="text-sm text-white"><CheckmarkRegular /></CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="text-sm leading-snug text-ink-700">
        {label}
        {description && <span className="mt-0.5 block text-xs text-ink-500">{description}</span>}
      </span>
    </label>
  );
}

// ---------------- Switch ----------------

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-700', disabled && 'cursor-not-allowed opacity-50')}>
      {label}
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-10 shrink-0 rounded-full bg-cream-300 outline-none transition focus-visible:ring-4 focus-visible:ring-seed-500/20 data-[state=checked]:bg-seed-500"
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

// ---------------- Tabs ----------------

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn('inline-flex flex-wrap items-center gap-1 rounded-xl bg-cream-200/70 p-1', className)}>{children}</TabsPrimitive.List>;
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold text-ink-500 outline-none transition hover:text-seed-950 focus-visible:ring-4 focus-visible:ring-seed-500/20 data-[state=active]:bg-white data-[state=active]:text-seed-950 data-[state=active]:shadow-card"
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-cream-300/70 px-1.5 py-0.5 text-[11px] font-black text-ink-700 group-data-[state=active]:bg-seed-500 group-data-[state=active]:text-white">{count}</span>
      )}
    </TabsPrimitive.Trigger>
  );
}
