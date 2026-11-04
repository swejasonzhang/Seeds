import { HomeRegular, VehicleCarRegular, VideoRegular } from '@fluentui/react-icons';
import { DAY_LONG, SETTING_LABEL, formatMinute, type DayRoute } from '@seeds/shared';
import { DatePicker, Spinner } from './kit';
import { EmptyState } from './ui';

/** A therapist's itinerary for one date: stops in order, with the drive between each (Azure Maps when configured). */
export function RouteSheet({ route, loading, date, onDate, homeLabel }: { route?: DayRoute; loading: boolean; date: string; onDate: (d: string) => void; homeLabel: string }) {
  return (
    <div className="card card-pad">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-seed-950">Route sheet</h2>
          {route && route.stops.length > 0 && (
            <p className="text-xs text-ink-500">
              {DAY_LONG[route.day]} · {route.stops.length} visits · {route.totalDriveMinutes} min / {route.totalDriveMiles} mi driving
              {route.travelSource === 'estimate' ? ' (estimated)' : ' (Azure Maps)'}
            </p>
          )}
        </div>
        <div className="w-56"><DatePicker value={date} onChange={onDate} /></div>
      </div>
      {loading && <Spinner label="Planning the route…" />}
      {route && route.stops.length === 0 && (
        <EmptyState icon={<VehicleCarRegular />} title={`No sessions on ${DAY_LONG[route.day]}`}>Pick another date to see that day’s route.</EmptyState>
      )}
      {route && route.stops.length > 0 && (
        <ol className="relative ml-3 border-l-2 border-dashed border-cream-300 pl-6">
          <li className="relative pb-4">
            <span className="absolute -left-[35px] grid h-7 w-7 place-items-center rounded-full bg-seed-950 text-sm text-cream-50"><HomeRegular /></span>
            <p className="text-sm font-bold text-ink-900">Start at home base</p>
            <p className="text-xs text-ink-500">{homeLabel}</p>
          </li>
          {route.stops.map((s) => (
            <li key={s.appointmentId} className="relative pb-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                {s.setting === 'telehealth' ? <><VideoRegular /> Telehealth: no drive</> : <><VehicleCarRegular /> {s.driveMinutes} min · {s.driveMiles} mi from {s.fromLabel}</>}
              </p>
              <span className="absolute -left-[35px] top-7 h-3.5 w-3.5 translate-x-[7px] rounded-full bg-seed-500 ring-4 ring-cream-100" />
              <div className="rounded-2xl border border-cream-200 bg-white p-3 shadow-card">
                <p className="font-bold text-ink-900">{formatMinute(s.start)} · {s.label}</p>
                <p className="text-xs text-ink-500">until {formatMinute(s.end)} · {s.childLabel} · {SETTING_LABEL[s.setting]} · {s.referenceCode}</p>
              </div>
            </li>
          ))}
          <li className="relative">
            <span className="absolute -left-[35px] grid h-7 w-7 place-items-center rounded-full bg-cream-300 text-sm text-seed-950"><HomeRegular /></span>
            <p className="text-sm font-bold text-ink-900">{route.returnHomeMinutes} min back to home base</p>
          </li>
        </ol>
      )}
    </div>
  );
}
