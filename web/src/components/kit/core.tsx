// SEEDS component kit (shadcn/ui pattern: Radix primitives + Tailwind, owned in-repo and branded).
import { createContext, forwardRef, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { ErrorCircleRegular } from '@fluentui/react-icons';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---------------- Button ----------------

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold transition-all duration-200 outline-none active:scale-[0.97] focus-visible:ring-4 focus-visible:ring-seed-500/25 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-seed-500 text-white shadow-sm hover:bg-seed-600 active:bg-seed-700',
        secondary: 'border border-cream-300 bg-white text-seed-900 shadow-sm hover:border-seed-300 hover:bg-seed-50',
        ghost: 'text-ink-700 hover:bg-cream-200 hover:text-seed-950',
        accent: 'bg-clay-100 text-clay-700 hover:bg-clay-200',
        dark: 'bg-seed-950 text-cream-50 hover:bg-seed-900',
        danger: 'bg-red-700 text-white hover:bg-red-800',
        link: 'h-auto! px-0! text-seed-700 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-lg px-3 text-xs',
        md: 'h-10 rounded-xl px-4 text-sm',
        lg: 'h-12 rounded-xl px-6 text-base',
        icon: 'h-9 w-9 rounded-xl text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type = 'button', ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp ref={ref} type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

// ---------------- Field (label + hint + error, wired for screen readers) ----------------

interface FieldCtx {
  id: string;
  invalid: boolean;
  describedBy?: string;
}
const FieldContext = createContext<FieldCtx | null>(null);
export const useField = () => useContext(FieldContext);

export function Field({ label, hint, error, required, children, className, name }: { label?: ReactNode; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string; name?: string }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <FieldContext.Provider value={{ id, invalid: Boolean(error), describedBy }}>
      <div data-field={name} className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <label htmlFor={id} className="text-sm font-bold text-ink-900">
            {label}
            {required && <span className="ml-0.5 text-clay-600" aria-hidden>*</span>}
          </label>
        )}
        {children}
        {error ? (
          <p id={`${id}-error`} className="flex items-center gap-1 text-xs font-semibold text-red-700">
            <ErrorCircleRegular className="shrink-0" /> {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-xs text-ink-500">{hint}</p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export const controlClass =
  'w-full rounded-xl border border-cream-300 bg-white px-3.5 text-[15px] text-ink-900 shadow-[0_1px_0_rgb(11_50_43/0.03)] outline-none transition placeholder:text-ink-500/70 hover:border-seed-300 focus:border-seed-500 focus:ring-4 focus:ring-seed-500/15 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:opacity-60 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/10';

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'> & { icon?: ReactNode; inputSize?: 'md' | 'lg' }>(
  ({ className, icon, inputSize = 'md', id, ...props }, ref) => {
    const f = useField();
    const input = (
      <input
        ref={ref}
        id={id ?? f?.id}
        aria-invalid={f?.invalid || undefined}
        aria-describedby={f?.describedBy}
        className={cn(controlClass, inputSize === 'lg' ? 'h-12' : 'h-10', icon && 'pl-10', className)}
        {...props}
      />
    );
    if (!icon) return input;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-ink-500">{icon}</span>
        {input}
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(({ className, id, ...props }, ref) => {
  const f = useField();
  return (
    <textarea
      ref={ref}
      id={id ?? f?.id}
      aria-invalid={f?.invalid || undefined}
      aria-describedby={f?.describedBy}
      className={cn(controlClass, 'min-h-28 resize-y py-3 leading-relaxed', className)}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';
