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

export function HeadCheekJiggleControls({ modifier, updateAnimationModifier }) {
  const strength = modifier.params?.strength ?? 0.5;
  const jigglePx = modifier.params?.jigglePx ?? 3;
  const softness = modifier.params?.softness ?? 0.3;
  const cheekRadius = modifier.params?.cheekRadius ?? 0.35;
  const gain = modifier.driver?.gain ?? 0.5;
  const deadZone = modifier.driver?.deadZone ?? 0.5;

  const handleStrengthChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, strength: value },
    });
  };

  const handleJiggleChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, jigglePx: value },
    });
  };

  const handleSoftnessChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, softness: value },
    });
  };

  const handleCheekRadiusChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      params: { ...modifier.params, cheekRadius: value },
    });
  };

  const handleGainChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      driver: { ...modifier.driver, gain: value },
    });
  };

  const handleDeadZoneChange = ([value]) => {
    updateAnimationModifier(modifier.id, {
      driver: { ...modifier.driver, deadZone: value },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <LabelWithTip label="Strength" tip="Overall intensity of the jiggle effect. 0 = no effect, 1 = full effect." />
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
        <LabelWithTip label="Jiggle" tip="Maximum vertex displacement in pixels. Higher = more visible jiggle." />
        <Slider
          min={0}
          max={10}
          step={0.5}
          value={[jigglePx]}
          onValueChange={handleJiggleChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {jigglePx.toFixed(1)}px
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Softness" tip="How far the jiggle spreads from center. Lower = more localized." />
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[softness]}
          onValueChange={handleSoftnessChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {softness.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Area" tip="Approximate cheek region size created by the wizard." />
        <Slider
          min={0.12}
          max={0.8}
          step={0.01}
          value={[cheekRadius]}
          onValueChange={handleCheekRadiusChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {Math.round(cheekRadius * 100)}%
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Gain" tip="Sensitivity multiplier for bone motion. Higher = more responsive." />
        <Slider
          min={0}
          max={2}
          step={0.05}
          value={[gain]}
          onValueChange={handleGainChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {gain.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LabelWithTip label="Dead zone" tip="Minimum bone displacement before jiggle activates. Helps filter out tiny movements." />
        <Slider
          min={0}
          max={5}
          step={0.1}
          value={[deadZone]}
          onValueChange={handleDeadZoneChange}
          className="flex-1"
        />
        <span className="text-[10px] text-muted-foreground font-mono w-8 text-right tabular-nums">
          {deadZone.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
