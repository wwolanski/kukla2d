import {
  listExportFormats,
  listExportTypes,
} from '@/features/export/domain/exportVariantRegistry.js';

import { cn } from '@/lib/utils.js';

import { Label } from '@/components/ui/label.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';

export function ExportTypeOptions({
  type,
  format,
  isExporting,
  onTypeChange,
  onFormatChange,
}) {
  const formats = listExportFormats(type);

  return (
    <div className={cn('grid gap-3', formats.length > 0 ? 'grid-cols-2' : 'grid-cols-1')}>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select value={type} onValueChange={onTypeChange} disabled={isExporting}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listExportTypes().map(option => (
              <SelectItem
                key={option.id}
                value={option.id}
                disabled={option.status === 'unactive'}
              >
                {option.label}
                {option.status === 'unactive' && (
                  <span className="ml-1 text-[10px] uppercase text-muted-foreground">Coming soon</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formats.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Format</Label>
          <Select value={format} onValueChange={onFormatChange} disabled={isExporting || formats.length <= 1}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formats.map(option => (
                <SelectItem key={option.format} value={option.format}>{option.formatLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
