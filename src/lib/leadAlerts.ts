export type LeadAlertMode = 'new' | 'closed';

export type LeadAlertPayload = {
  mode: LeadAlertMode;
  leadId?: string;
  emittedAt: number;
};

const ALERT_EVENT = 'dmh:lead-alert';
const ALERT_STORAGE_KEY = 'dmh:lead-alert';

export const getLeadAlertEventName = () => ALERT_EVENT;
export const getLeadAlertStorageKey = () => ALERT_STORAGE_KEY;

export const publishLeadAlert = (mode: LeadAlertMode, leadId?: string) => {
  if (typeof window === 'undefined') return;

  const payload: LeadAlertPayload = {
    mode,
    leadId,
    emittedAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail: payload }));

  try {
    window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
};
