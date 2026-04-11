import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      new Notification(title, { body, tag: title });
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body, tag: title });
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

    return () => {
      window.removeEventListener('click', requestPermissionOnInteraction);
    };
  }, []);

  useEffect(() => {
    const emitLeadAlert = async (mode: 'new' | 'closed') => {
      const title = mode === 'new' ? 'Novo lead criado! 🔔' : 'Novo cliente fechado! 🎉';
      const body = mode === 'new'
        ? 'Um novo lead entrou em Novo Contato.'
        : 'Um lead foi movido para Fechados.';

      if (typeof document !== 'undefined' && document.hidden) {
        await showSystemNotification(title, body);
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

    const channel = supabase
      .channel('lead-alerts-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const created = payload.new as { stage?: string };
        if (created.stage === 'novo_contato') {
          void emitLeadAlert('new');
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const current = payload.new as { stage?: string };
        const previous = (payload.old || {}) as { stage?: string };
        if (current.stage === 'fechados' && previous.stage !== 'fechados') {
          void emitLeadAlert('closed');
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [toast]);

  return null;
}
