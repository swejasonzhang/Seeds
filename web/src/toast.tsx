import { toast } from './components/kit';

/** Toast helper used across pages (Sonner under the hood, branded in kit/feedback). */
export function useNotify() {
  return (title: string, intent: 'success' | 'error' | 'info' | 'warning' = 'success', body?: string) => {
    const fn = intent === 'success' ? toast.success : intent === 'error' ? toast.error : intent === 'warning' ? toast.warning : toast.info;
    fn(title, { description: body, duration: intent === 'error' ? 8000 : 4000 });
  };
}
