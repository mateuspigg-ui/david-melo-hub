export type LeadAlertMode = 'new' | 'closed';

export type LeadAlertPayload = {
  mode: LeadAlertMode;
  leadId?: string;
  emittedAt: number;
};

const ALERT_EVENT = 'dmh:lead-alert';
const ALERT_STORAGE_KEY = 'dmh:lead-alert';
const ALERT_BROADCAST_CHANNEL = 'dmh:lead-alerts-channel';

export const getLeadAlertEventName = () => ALERT_EVENT;
export const getLeadAlertStorageKey = () => ALERT_STORAGE_KEY;
export const getLeadAlertBroadcastChannel = () => ALERT_BROADCAST_CHANNEL;

export const publishLeadAlert = (mode: LeadAlertMode, leadId?: string) => {
  if (typeof window === 'undefined') return;

  const payload: LeadAlertPayload = {
    mode,
    leadId,
    emittedAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail: payload }));

  try {
    const channel = new BroadcastChannel(ALERT_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // no-op
  }

  try {
    window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
};
