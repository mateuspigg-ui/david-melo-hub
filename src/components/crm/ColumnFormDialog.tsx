import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette } from 'lucide-react';

const COLOR_PRESETS = [
  { label: 'Gold', value: 'hsl(var(--gold))' },
  { label: 'Azul', value: 'hsl(210 60% 50%)' },
  { label: 'Amarelo', value: 'hsl(48 95% 52%)' },
  { label: 'Laranja', value: 'hsl(35 80% 55%)' },
  { label: 'Verde', value: 'hsl(142 60% 45%)' },
  { label: 'Vermelho', value: 'hsl(0 60% 50%)' },
  { label: 'Roxo', value: 'hsl(280 60% 50%)' },
  { label: 'Rosa', value: 'hsl(330 70% 55%)' },
  { label: 'Cinza', value: 'hsl(220 10% 50%)' },
  { label: 'Teal', value: 'hsl(170 55% 45%)' },
  { label: 'Índigo', value: 'hsl(240 60% 55%)' },
  { label: 'Amber', value: 'hsl(40 90% 50%)' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialLabel?: string;
  initialColor?: string;
  title?: string;
  onSave: (label: string, color: string) => void;
}

export default function ColumnFormDialog({ open, onOpenChange, initialLabel, initialColor, title, onSave }: Props) {
  const [label, setLabel] = useState(initialLabel || '');
  const [color, setColor] = useState(initialColor || COLOR_PRESETS[0].value);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel || '');
      setColor(initialColor || COLOR_PRESETS[0].value);
    }
  }, [open, initialLabel, initialColor]);

  const handleSave = () => {
    if (!label.trim()) return;
    onSave(label.trim(), color);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-gold" />
            {title || 'Nova Coluna'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Nome da Coluna
            </Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Aguardando Proposta"
              className="h-11 rounded-xl"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Cor
            </Label>
            <div className="grid grid-cols-6 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  className={`w-10 h-10 rounded-xl border-2 transition-all flex items-center justify-center ${
                    color === preset.value
                      ? 'border-foreground scale-110 shadow-lg'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: preset.value }}
                  title={preset.label}
                >
                  {color === preset.value && (
                    <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-3">
              <div
                className="w-10 h-10 rounded-xl border border-border/20 shadow-inner"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1">
                <p className="text-xs font-bold text-foreground">{label || 'Sua coluna'}</p>
                <p className="text-[10px] text-muted-foreground">Preview da coluna</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim()}
            className="rounded-xl bg-gold hover:bg-gold/90 text-white"
          >
            {title === 'Editar Coluna' ? 'Salvar' : 'Criar Coluna'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
