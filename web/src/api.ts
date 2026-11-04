import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiError,
  AutoMatchResponse,
  BookRequest,
  CaseDetail,
  CaseStatus,
  ChecklistItem,
  ConfirmBookingsRequest,
  ConfirmBookingsResponse,
  DayRoute,
  Discipline,
  IntakeResult,
  IntakeSubmission,
  MatchResponse,
  MeDto,
  Paged,
  PublicConfigDto,
  QueueItem,
  StatusCounts,
  TherapistDetail,
  TherapistSummary,
  UpdatePlanRequest,
} from '@seeds/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body?: ApiError;
  constructor(status: number, body?: ApiError) {
    super(body?.message ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

// Bearer-token provider; set by the Entra sign-in layer when AUTH_MODE=entra (demo mode sends no token).
let tokenProvider: (() => Promise<string | null>) | null = null;
export const setTokenProvider = (p: typeof tokenProvider) => (tokenProvider = p);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenProvider ? await tokenProvider() : null;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : undefined;
  if (!res.ok) throw new ApiRequestError(res.status, body);
  return body as T;
}

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

// ---------- queries ----------

export const usePublicConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<PublicConfigDto>('/config'), staleTime: Infinity });
export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api<MeDto>('/me'), staleTime: Infinity });

export interface QueueParams {
  status: CaseStatus;
  discipline?: Discipline;
  q?: string;
  sla?: 'at-risk' | 'breached';
  page: number;
  pageSize: number;
}

export function useQueue(p: QueueParams) {
  const qs = new URLSearchParams({ status: p.status, page: String(p.page), pageSize: String(p.pageSize) });
  if (p.discipline) qs.set('discipline', p.discipline);
  if (p.q) qs.set('q', p.q);
  if (p.sla) qs.set('sla', p.sla);
  return useQuery({ queryKey: ['queue', p], queryFn: () => api<Paged<QueueItem>>(`/queue?${qs}`), placeholderData: (prev) => prev });
}

export const useQueueCounts = (discipline?: Discipline) =>
  useQuery({ queryKey: ['queue-counts', discipline], queryFn: () => api<StatusCounts>(`/queue/counts${discipline ? `?discipline=${discipline}` : ''}`) });

export const useCase = (id: string) => useQuery({ queryKey: ['case', id], queryFn: () => api<CaseDetail>(`/cases/${id}`) });

export const useMatches = (id: string, enabled: boolean) =>
  useQuery({ queryKey: ['matches', id], queryFn: () => api<MatchResponse>(`/cases/${id}/matches`), enabled, staleTime: 0 });

export const useTherapists = () => useQuery({ queryKey: ['therapists'], queryFn: () => api<TherapistSummary[]>('/therapists') });
export const useTherapist = (id: string) => useQuery({ queryKey: ['therapist', id], queryFn: () => api<TherapistDetail>(`/therapists/${id}`) });
export const useRoute = (id: string, date: string) =>
  useQuery({ queryKey: ['route', id, date], queryFn: () => api<DayRoute>(`/therapists/${id}/route?date=${date}`) });

// ---------- mutations ----------

/** Any write can change queue order, counts, a case, schedules: refresh them all (cheap at this scale). */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all(['queue', 'queue-counts', 'case', 'matches', 'therapists', 'therapist', 'route'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export const useSubmitIntake = () => useMutation({ mutationFn: (body: IntakeSubmission) => post<IntakeResult>('/intake', body) });

export function useCaseActions(id: string) {
  const invalidate = useInvalidateAll();
  const opts = { onSuccess: invalidate };
  return {
    checklist: useMutation({ mutationFn: (b: { item: ChecklistItem; completed: boolean }) => patch<void>(`/cases/${id}/checklist`, b), ...opts }),
    plan: useMutation({ mutationFn: (b: UpdatePlanRequest) => patch<void>(`/cases/${id}/plan`, b), ...opts }),
    status: useMutation({ mutationFn: (b: { status: 'on-hold' | 'closed' | 'ready'; note?: string }) => post<void>(`/cases/${id}/status`, b), ...opts }),
    resolveReview: useMutation({ mutationFn: (b: { note?: string }) => post<void>(`/cases/${id}/resolve-review`, b), ...opts }),
    book: useMutation({ mutationFn: (b: BookRequest) => post<unknown>(`/cases/${id}/book`, b), ...opts }),
    unschedule: useMutation({ mutationFn: (reason: string) => post<void>(`/cases/${id}/unschedule`, { reason }), ...opts }),
  };
}

export const useAutoMatch = () =>
  useMutation({ mutationFn: (b: { discipline?: Discipline; limit: number }) => post<AutoMatchResponse>('/queue/auto-match', b) });

export function useConfirmBookings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (b: ConfirmBookingsRequest) => post<ConfirmBookingsResponse>('/queue/auto-match/confirm', b), onSuccess: invalidate });
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
