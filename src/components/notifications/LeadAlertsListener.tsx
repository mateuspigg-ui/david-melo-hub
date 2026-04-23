import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getLeadAlertBroadcastChannel, getLeadAlertEventName, getLeadAlertStorageKey, type LeadAlertPayload } from '@/lib/leadAlerts';

const playLeadAlert = (mode: 'new' | 'closed') => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = mode === 'new' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(mode === 'new' ? 720 : 440, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(mode === 'new' ? 980 : 660, audioContext.currentTime + 0.24);
    oscillator.frequency.exponentialRampToValueAtTime(mode === 'new' ? 1080 : 920, audioContext.currentTime + 0.52);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.62);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.66);
    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    return;
  }
};

const showSystemNotification = async (title: string, body: string) => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

  try {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, tag: title, requireInteraction: true, silent: false } as NotificationOptions);
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body, tag: title, requireInteraction: true, silent: false } as NotificationOptions);
      }
    }
  } catch {
    return;
  }
};

export default function LeadAlertsListener() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    const requestPermissionOnInteraction = () => {
      if (Notification.permission !== 'default') return;
      void Notification.requestPermission();
    };

    window.addEventListener('click', requestPermissionOnInteraction, { once: true });
    window.addEventListener('keydown', requestPermissionOnInteraction, { once: true });
    window.addEventListener('touchstart', requestPermissionOnInteraction, { once: true });

    return () => {
      window.removeEventListener('click', requestPermissionOnInteraction);
      window.removeEventListener('keydown', requestPermissionOnInteraction);
      window.removeEventListener('touchstart', requestPermissionOnInteraction);
    };
  }, []);

  useEffect(() => {
    const lastAlertByKey = new Map<string, number>();
    const seenLeadEvents = new Set<string>();
    let latestKnownNovoContatoCreatedAt = '';

    const shouldIgnoreDuplicate = (mode: 'new' | 'closed', leadId?: string) => {
      const key = `${mode}:${leadId || 'no-id'}`;
      const now = Date.now();
      const last = lastAlertByKey.get(key) || 0;
      lastAlertByKey.set(key, now);
      return now - last < 5000;
    };

    const emitLeadAlert = async (mode: 'new' | 'closed') => {
      const title = mode === 'new' ? 'Chegou novo orçamento! 🔔' : 'Novo cliente fechado! 🎉';
      const body = mode === 'new'
        ? 'Um novo orçamento entrou em Novo Contato.'
        : 'Um lead foi movido para Fechados.';

      await showSystemNotification(title, body);

      if (typeof document !== 'undefined' && document.hidden) {
        playLeadAlert(mode);
        return;
      }

      playLeadAlert(mode);
      toast({
        title,
        description: body,
        className: 'border-l-4 border-l-[#C5A059] bg-[#C5A059]/12',
        duration: 15000,
      });
    };

    const processPayload = (payload?: Partial<LeadAlertPayload>) => {
      const mode = payload?.mode;
      const leadId = payload?.leadId;
      if (mode !== 'new' && mode !== 'closed') return;

      if (leadId) {
        const uniqueKey = `${mode}:${leadId}`;
        if (seenLeadEvents.has(uniqueKey)) return;
        seenLeadEvents.add(uniqueKey);
      }

      if (shouldIgnoreDuplicate(mode, leadId)) return;
      void emitLeadAlert(mode);
    };

    const onWindowAlert = (event: Event) => {
      const customEvent = event as CustomEvent<LeadAlertPayload>;
      processPayload(customEvent.detail);
    };

    const onStorageAlert = (event: StorageEvent) => {
      if (event.key !== getLeadAlertStorageKey() || !event.newValue) return;
      try {
        processPayload(JSON.parse(event.newValue) as LeadAlertPayload);
      } catch {
        return;
      }
    };

    let broadcastChannel: BroadcastChannel | null = null;
    const onBroadcastAlert = (event: MessageEvent<LeadAlertPayload>) => {
      processPayload(event.data);
    };

    try {
      broadcastChannel = new BroadcastChannel(getLeadAlertBroadcastChannel());
      broadcastChannel.addEventListener('message', onBroadcastAlert);
    } catch {
      broadcastChannel = null;
    }

    window.addEventListener(getLeadAlertEventName(), onWindowAlert as EventListener);
    window.addEventListener('storage', onStorageAlert);

    const supabaseChannel = supabase
      .channel('lead-alerts-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const created = payload.new as { stage?: string };
        if (created.stage === 'novo_contato') {
          processPayload({ mode: 'new', leadId: (payload.new as { id?: string }).id });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const current = payload.new as { id?: string; stage?: string };
        const previous = (payload.old || {}) as { stage?: string };
        if (current.stage === 'fechados' && previous.stage !== 'fechados') {
          processPayload({ mode: 'closed', leadId: current.id });
        }
      })
      .subscribe();

    const checkLatestNovoContato = async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, stage, created_at')
        .eq('stage', 'novo_contato')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data?.created_at) return;

      if (!latestKnownNovoContatoCreatedAt) {
        latestKnownNovoContatoCreatedAt = data.created_at;
        return;
      }

      if (new Date(data.created_at).getTime() > new Date(latestKnownNovoContatoCreatedAt).getTime()) {
        latestKnownNovoContatoCreatedAt = data.created_at;
        processPayload({ mode: 'new', leadId: data.id });
      }
    };

    void checkLatestNovoContato();
    const pollingId = window.setInterval(() => {
      void checkLatestNovoContato();
    }, 8000);

    return () => {
      window.clearInterval(pollingId);
      window.removeEventListener(getLeadAlertEventName(), onWindowAlert as EventListener);
      window.removeEventListener('storage', onStorageAlert);
      if (broadcastChannel) {
        broadcastChannel.removeEventListener('message', onBroadcastAlert);
        broadcastChannel.close();
      }
      void supabase.removeChannel(supabaseChannel);
    };
  }, [toast]);

  return null;
}
