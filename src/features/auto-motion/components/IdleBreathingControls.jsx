import { Slider } from '@/components/ui/slider.jsx';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.jsx';

function LabelWithTip({ label, tip }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[10px] text-muted-foreground w-12 shrink-0 cursor-default underline decoration-dotted decoration-muted-foreground/30 underline-offset-2">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px] max-w-[180px]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function IdleBreathingControls({ modifier, updateAnimationModifier }) {
  const strength = modifier.params?.strength ?? 0.5;
  const periodMs = modifier.driver?.periodMs ?? 2400;
  const phase = modifier.driver?.phase ?? 0;
  const chestExpandPx = modifier.params?.chestExpandPx ?? 4;
  const verticalLiftPx = modifier.params?.verticalLiftPx ?? 16;

  const handleStrengthChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, strength: value },
    });
  };

  const handleSpeedChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      driver: { ...modifier.driver, periodMs: Math.round(value) },
    });
  };

  const handlePhaseChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      driver: { ...modifier.driver, phase: value },
    });
  };

  const handleChestChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, chestExpandPx: value },
    });
  };

  const handleLiftChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, verticalLiftPx: value },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <LabelWithTip label="Strength" tip="Amplitude of the breathing motion. 0 = no motion, 1 = full motion." />
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[strength]}
          onValueChange={handleStrengthChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {strength.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Speed" tip="Duration of one full breath cycle in milliseconds. Lower = faster." />
        <Slider
          min={1200}
          max={5000}
          step={50}
          value={[periodMs]}
          onValueChange={handleSpeedChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {periodMs}ms
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Phase" tip="Offset in the breathing cycle. 0 = start, 0.5 = mid-cycle." />
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[phase]}
          onValueChange={handlePhaseChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {phase.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Chest" tip="Horizontal chest expansion in pixels. Higher = more chest swell." />
        <Slider
          min={0}
          max={20}
          step={0.5}
          value={[chestExpandPx]}
          onValueChange={handleChestChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {chestExpandPx.toFixed(1)}px
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Lift" tip="Vertical chest lift in pixels. Higher = more upward motion." />
        <Slider
          min={0}
          max={50}
          step={1}
          value={[verticalLiftPx]}
          onValueChange={handleLiftChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {verticalLiftPx}px
        </span>
      </div>
    </div>
  );
}
