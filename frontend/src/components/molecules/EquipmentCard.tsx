'use client';

import { cn } from '@/components/atoms/cn';
import { GameIcon } from '@/components/atoms/GameIcon';
import { AcShield } from './AcShield';

type EquipmentCardProps = {
  iconName: string;
  label: string;
  stats?: string;
  note?: string;
  acValue?: number;
  className?: string;
};

export function EquipmentCard({ iconName, label, stats, note, acValue, className }: EquipmentCardProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-component bg-surface-2',
      className,
    )}>
      <GameIcon category="item" name={iconName} size="lg" className="text-on-surface-variant shrink-0" />

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-body-sm font-medium text-on-surface truncate">{label}</span>
        {stats && (
          <span className="text-label-sm text-on-surface-variant">{stats}</span>
        )}
        {note && (
          <span className="text-label-sm text-on-surface-variant italic">{note}</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {acValue !== undefined && (
          <AcShield value={acValue} size="sm" />
        )}
      </div>
    </div>
  );
}
