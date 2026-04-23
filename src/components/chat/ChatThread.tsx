import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Paperclip, Send, FileText, Download, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_type: 'client' | 'company';
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
  read_at?: string | null;
}

interface Props {
  /** Quem está olhando (define o lado das bolhas) */
  viewerSide: 'client' | 'company';
  messages: ChatMessage[];
  loading?: boolean;
  sending?: boolean;
  uploading?: boolean;
  uploadProgress?: number;
  onSend: (body: string) => Promise<void> | void;
  onUpload: (files: File[]) => Promise<void> | void;
  emptyHint?: string;
  /** Para um header customizado opcional */
  header?: React.ReactNode;
  className?: string;
  /** Tamanho máximo de upload em bytes (default 25MB) */
  maxUploadBytes?: number;
}

const formatBytes = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (type: string | null) => !!type && type.startsWith('image/');

export default function ChatThread({
  viewerSide,
  messages,
  loading,
  sending,
  uploading,
  uploadProgress,
  onSend,
  onUpload,
  emptyHint,
  header,
  className,
  maxUploadBytes = 25 * 1024 * 1024,
}: Props) {
  const [body, setBody] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingFileNames, setPendingFileNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  const handleSend = async () => {
    const text = body.trim();
    if (!text) return;
    await onSend(text);
    setBody('');
  };

  const handleFiles = async (files: FileList | null | undefined) => {
    const selected = Array.from(files || []);
    if (selected.length === 0) return;

    const oversized = selected.find((file) => file.size > maxUploadBytes);
    if (oversized) {
      alert(`Arquivo "${oversized.name}" maior que o limite de ${(maxUploadBytes / (1024 * 1024)).toFixed(0)}MB.`);
      return;
    }

    setPendingFileNames(selected.map((file) => file.name));
    await onUpload(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('flex flex-col h-full bg-secondary/10', className)}>
      {header}

      {/* Lista */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-hide">
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-16 px-4 max-w-sm mx-auto">
            <div className="w-14 h-14 rounded-full bg-gold/10 text-gold mx-auto mb-3 flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <p className="font-bold text-foreground mb-1">Sem mensagens ainda</p>
            <p className="text-xs">{emptyHint || 'Envie a primeira mensagem para iniciar a conversa.'}</p>
          </div>
        )}

        {messages.map((msg) => {
          const mine = msg.sender_type === viewerSide;
          return (
            <div key={msg.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm space-y-1.5',
                  mine
                    ? 'bg-gradient-gold text-white rounded-br-md'
                    : 'bg-white text-foreground border border-border/40 rounded-bl-md',
                )}
              >
                {msg.attachment_url && (
                  <div>
                    {isImage(msg.attachment_type) ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage(msg.attachment_url)}
                        className="block rounded-xl overflow-hidden mb-1 max-w-[260px] hover:opacity-90 transition"
                      >
                        <img
                          src={msg.attachment_url}
                          alt={msg.attachment_name || 'Anexo'}
                          className="w-full h-auto block"
                          loading="lazy"
                        />
                      </button>
                    ) : (
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        download={msg.attachment_name || undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition',
                          mine
                            ? 'bg-white/20 hover:bg-white/30 text-white'
                            : 'bg-secondary/50 hover:bg-secondary text-foreground',
                        )}
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        <span className="truncate flex-1 text-left">{msg.attachment_name || 'Anexo'}</span>
                        <span className={cn('text-[10px] font-medium', mine ? 'text-white/70' : 'text-muted-foreground')}>
                          {formatBytes(msg.attachment_size)}
                        </span>
                        <Download className="w-3.5 h-3.5 opacity-70" />
                      </a>
                    )}
                  </div>
                )}
                {msg.body && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                )}
                <p
                  className={cn(
                    'text-[10px] tracking-wider uppercase font-bold',
                    mine ? 'text-white/70 text-right' : 'text-muted-foreground',
                  )}
                >
                  {format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-border/30 bg-white p-3 md:p-4 space-y-2">
        {pendingFileNames.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">
              {pendingFileNames.length === 1
                ? <>Arquivo carregado para envio: <span className="font-black">{pendingFileNames[0]}</span></>
                : <>Arquivos carregados para envio: <span className="font-black">{pendingFileNames.length} selecionados</span></>}
            </span>
            <button
              type="button"
              onClick={() => setPendingFileNames([])}
              className="text-emerald-700/70 hover:text-emerald-900"
              title="Ocultar confirmação"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {uploading && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-gold uppercase tracking-wider">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo {uploadProgress ? `${uploadProgress}%` : ''}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 h-11 w-11 rounded-xl border-border/40"
            disabled={uploading || sending}
            onClick={() => fileInputRef.current?.click()}
            title="Anexar arquivo"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Escreva uma mensagem..."
            rows={1}
            className="resize-none min-h-[44px] max-h-32 rounded-xl bg-secondary/20 border-border/40 focus:border-gold"
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || uploading || !body.trim()}
            className="shrink-0 h-11 px-4 rounded-xl bg-gradient-gold hover:opacity-90 text-white shadow-gold"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Preview imagem */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-5 right-5 text-white/80 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
          >
            <X className="w-7 h-7" />
          </button>
          <img src={previewImage} alt="Preview" className="max-h-[88vh] max-w-[92vw] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
