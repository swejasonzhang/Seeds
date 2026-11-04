import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowUploadRegular,
  CheckmarkCircle24Filled,
  CheckmarkRegular,
  CircleRegular,
  ClockRegular,
  DocumentRegular,
  HourglassHalfRegular,
  PenRegular,
} from '@fluentui/react-icons';
import { OWNER_LABEL, type JourneyStepDto, type JourneySummary } from '@seeds/shared';
import { OFFICE_POLICY } from '../site/practice';
import { Meter } from './ui';
import { formatDate } from './bits';
import { Button, DatePicker, Dialog, Field, Input, Switch, Tip, cn } from './kit';

type Mode = 'family' | 'staff' | 'readonly';

export interface JourneyHandlers {
  onSign?: (step: JourneyStepDto, signatureName: string) => Promise<unknown>;
  onConfirm?: (step: JourneyStepDto, note?: string) => Promise<unknown>;
  onUpload?: (step: JourneyStepDto, file: File) => Promise<unknown>;
  onToggle?: (step: JourneyStepDto, done: boolean) => Promise<unknown>;
  busy?: boolean;
}

export function JourneyProgress({ journey, compact = false }: { journey: JourneySummary; compact?: boolean }) {
  const pct = journey.total ? Math.round((journey.done / journey.total) * 100) : 100;
  return (
    <div className={compact ? '' : 'rounded-2xl bg-seed-50 p-4'}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-ink-900">{journey.done} of {journey.total} steps done</p>
        <p className="text-xs font-semibold text-ink-500">{pct}%</p>
      </div>
      <Meter value={journey.done} max={journey.total} label="Checklist progress" kind="progress" />
      {!compact && journey.blocking.length > 0 && (
        <p className="mt-2 text-xs text-ink-500">Before scheduling: {journey.blocking.map((b) => b.title).join(' · ')}</p>
      )}
    </div>
  );
}

export function JourneyView({ journey, mode, handlers = {} }: { journey: JourneySummary; mode: Mode; handlers?: JourneyHandlers }) {
  return (
    <div className="space-y-6">
      {journey.phases.map((phase) => {
        const done = phase.steps.filter((s) => s.status === 'done').length;
        return (
          <section key={phase.id}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-ink-500">{phase.title}</h3>
              <span className="text-xs font-semibold text-ink-500">{done}/{phase.steps.length}</span>
            </div>
            <ol className="relative space-y-2 before:absolute before:bottom-6 before:left-[22px] before:top-6 before:w-0.5 before:bg-cream-200">
              {phase.steps.map((step) => <StepRow key={step.id} step={step} mode={mode} handlers={handlers} />)}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function StatusIcon({ step }: { step: JourneyStepDto }) {
  if (step.status === 'done') return <CheckmarkCircle24Filled className="text-seed-500" aria-label="Done" />;
  if (step.status === 'waiting') return <HourglassHalfRegular className="text-amber-700" aria-label="Waiting on others" />;
  return <CircleRegular className="text-clay-500" aria-label="To do" />;
}

function StepRow({ step, mode, handlers }: { step: JourneyStepDto; mode: Mode; handlers: JourneyHandlers }) {
  const [signing, setSigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = step.status === 'done';

  let action: ReactNode = null;
  if (mode === 'staff' && handlers.onToggle) {
    action = <Switch checked={done} disabled={handlers.busy} onCheckedChange={(v) => void handlers.onToggle!(step, v)} label={done ? 'Done' : 'Open'} />;
  } else if (mode === 'family' && !done && step.familyAction) {
    if (step.familyAction === 'sign') {
      action = <Button onClick={() => setSigning(true)}><PenRegular /> Review &amp; sign</Button>;
    } else if (step.familyAction === 'upload') {
      action = (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlers.onUpload?.(step, f);
              e.target.value = '';
            }}
          />
          <Button variant={step.optional ? 'secondary' : 'primary'} disabled={handlers.busy} onClick={() => fileRef.current?.click()}>
            <ArrowUploadRegular /> Upload
          </Button>
        </>
      );
    } else {
      action = (
        <Button variant={step.status === 'todo' ? 'primary' : 'secondary'} onClick={() => setConfirming(true)}>
          <CheckmarkRegular /> {step.status === 'todo' ? 'Mark done' : 'It happened'}
        </Button>
      );
    }
  }

  return (
    <li className={cn('relative flex flex-wrap items-center gap-3 rounded-2xl border p-3 pr-4 transition sm:flex-nowrap', done ? 'border-transparent' : step.status === 'todo' ? 'border-clay-200 bg-white shadow-card' : 'border-cream-200 bg-white')}>
      <span className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-2xl">
        <StatusIcon step={step} />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('font-bold', done ? 'text-ink-500' : 'text-ink-900')}>{step.title}</p>
          {step.optional && <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-500">Optional</span>}
          {!done && step.required && <span className="rounded-full bg-clay-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-clay-700 ring-1 ring-clay-200">Needed to schedule</span>}
        </div>
        {!done && <p className="mt-0.5 text-sm text-ink-500">{step.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {done ? (
            <span className="flex items-center gap-1">
              <CheckmarkRegular /> {step.completedBy ? `Done by ${step.completedBy}` : 'Done'}
              {step.completedAt ? ` · ${formatDate(step.completedAt)}` : ''}
            </span>
          ) : (
            <span className="font-bold">{step.status === 'waiting' ? 'Waiting on' : 'With'}: {OWNER_LABEL[step.owner]}</span>
          )}
          {!done && step.timeline && (
            <Tip content="Typical New York State timeline. Confirm dates with your district.">
              <span tabIndex={0} className="flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-2"><ClockRegular /> {step.timeline}</span>
            </Tip>
          )}
          {step.documentKind && !done && <span className="flex items-center gap-1"><DocumentRegular /> PDF or photo</span>}
        </div>
      </div>
      {action && <div className="ml-14 shrink-0 sm:ml-0">{action}</div>}

      {signing && <SignDialog step={step} onClose={() => setSigning(false)} onSign={(name) => handlers.onSign!(step, name)} />}
      {confirming && <ConfirmDialog step={step} onClose={() => setConfirming(false)} onConfirm={(note) => handlers.onConfirm!(step, note)} />}
    </li>
  );
}

const HIPAA_SUMMARY = [
  'We keep your child’s health information private and secure.',
  'We use it only to provide care, arrange payment and run our practice, or as you allow in writing.',
  'You can ask to see or get a copy of your child’s records, and ask us to correct them.',
  'You can request the full Notice of Privacy Practices from our front desk at any time.',
];

function SignDialog({ step, onClose, onSign }: { step: JourneyStepDto; onClose: () => void; onSign: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const points = step.id === 'office-policy' ? OFFICE_POLICY : HIPAA_SUMMARY;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={step.title}
      description="Please read, then type your name to sign."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={name.trim().length < 2 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSign(name.trim());
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            <PenRegular /> I agree &amp; sign
          </Button>
        </>
      }
    >
      <ul className="space-y-2.5 rounded-2xl bg-cream-50 p-4">
        {points.map((p) => (
          <li key={p} className="flex gap-2 text-sm text-ink-700"><CheckmarkRegular className="mt-0.5 shrink-0 text-seed-500" /> {p}</li>
        ))}
      </ul>
      <Field label="Your full name" required className="mt-5">
        <Input inputSize="lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ana Lopez" autoFocus />
      </Field>
    </Dialog>
  );
}

function ConfirmDialog({ step, onClose, onConfirm }: { step: JourneyStepDto; onClose: () => void; onConfirm: (note?: string) => Promise<unknown> }) {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={step.title}
      description={step.description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(date ? `on ${formatDate(date)}` : undefined);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            <CheckmarkRegular /> Mark done
          </Button>
        </>
      }
    >
      <Field label="When did this happen?" hint="Your district’s timelines count from this date.">
        <DatePicker value={date} onChange={setDate} max={new Date().toLocaleDateString('en-CA')} />
      </Field>
    </Dialog>
  );
}
