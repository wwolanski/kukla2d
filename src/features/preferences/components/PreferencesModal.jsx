import {
  Sun,
  Moon,
  Monitor,
  Palette,
  Info,
  Settings2,
  Layout,
  Play,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  loadAnimationSettings,
  saveAnimationSettings,
  resetAnimationSettings,
} from "@/platform/animationSettingsRepository.js";

import { useTheme } from "@/app/providers/theme/useTheme.js";

import { ANIMATION_DEFAULTS } from "@/domain/animationDefaults.js";

import { AVAILABLE_FONTS } from "@/features/preferences/domain/availableFonts.js";
import {
  darkThemePresets,
  lightThemePresets,
} from "@/features/preferences/domain/themePresets.js";

import { Button } from "@/components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.jsx";
import { Input } from "@/components/ui/input.jsx";
import { Label } from "@/components/ui/label.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.jsx";
import { Slider } from "@/components/ui/slider.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.jsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.jsx";

export function PreferencesModal({ open, onOpenChange }) {
  const [activeTab, setActiveTab] = useState("interface");
  const {
    themeMode,
    setThemeMode,
    openThemeModal,
    setLightTheme,
    setDarkTheme,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
  } = useTheme();

  const [animFrameCount, setAnimFrameCount] = useState(48);
  const [animFps, setAnimFps] = useState(24);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [animSaveError, setAnimSaveError] = useState(null);

  const loadAnim = useCallback(() => {
    const settings = loadAnimationSettings();
    setAnimFrameCount(settings.frameCount);
    setAnimFps(settings.fps);
    setAnimSpeed(settings.speed);
    setAnimSaveError(null);
  }, []);

  useEffect(() => {
    if (open) loadAnim();
  }, [open, loadAnim]);

  useEffect(() => {
    if (activeTab === "about" && open) {
      const script = document.createElement("script");
      script.src = "https://buttons.github.io/buttons.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    }
  }, [activeTab, open]);

  const handleAnimSave = useCallback(() => {
    const result = saveAnimationSettings({
      frameCount: animFrameCount,
      fps: animFps,
      speed: animSpeed,
    });
    if (!result.ok) {
      setAnimSaveError(result.error);
    } else {
      setAnimSaveError(null);
    }
  }, [animFrameCount, animFps, animSpeed]);

  const handleAnimReset = useCallback(() => {
    resetAnimationSettings();
    setAnimFrameCount(ANIMATION_DEFAULTS.frameCount);
    setAnimFps(ANIMATION_DEFAULTS.fps);
    setAnimSpeed(ANIMATION_DEFAULTS.speed);
    setAnimSaveError(null);
  }, []);

  const animDurationSec =
    animFrameCount > 0 && animFps > 0
      ? (animFrameCount / animFps).toFixed(2)
      : "—";

  const handleThemeSelectClick = () => {
    const config =
      themeMode === "dark" ||
      (themeMode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? {
            title: "Select Dark Theme",
            themes: darkThemePresets,
            onSelect: setDarkTheme,
          }
        : {
            title: "Select Light Theme",
            themes: lightThemePresets,
            onSelect: setLightTheme,
          };
    openThemeModal(config);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden outline-none border-none shadow-2xl">
        <div className="flex flex-col h-[500px]">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings2 className="w-5 h-5 text-primary" />
              Preferences
            </DialogTitle>
          </DialogHeader>

          <Tabs
            defaultValue="interface"
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-1 overflow-hidden"
          >
            <TabsList className="flex flex-col h-full w-48 rounded-none border-r bg-muted/30 p-2 gap-1 items-stretch justify-start">
              <TabsTrigger
                value="general"
                className="justify-start gap-2 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Settings2 className="w-4 h-4" />
                General
              </TabsTrigger>
              <TabsTrigger
                value="interface"
                className="justify-start gap-2 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Layout className="w-4 h-4" />
                Interface
              </TabsTrigger>
              <TabsTrigger
                value="animation"
                className="justify-start gap-2 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Play className="w-4 h-4" />
                Animation
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="justify-start gap-2 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Info className="w-4 h-4" />
                About
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6 bg-background">
              <TabsContent value="general" className="mt-0 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">General Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Nothing here yet
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="interface" className="mt-0 space-y-8">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium">Appearance</h3>
                    <p className="text-sm text-muted-foreground">
                      Customize how Kukla2D looks on your screen.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Theme Mode</Label>
                    <div className="flex items-center gap-4">
                      <ToggleGroup
                        type="single"
                        value={themeMode}
                        onValueChange={(value) => {
                          if (value) setThemeMode(value);
                        }}
                        aria-label="Theme mode"
                        className="bg-muted p-1 rounded-md"
                      >
                        <ToggleGroupItem
                          value="light"
                          aria-label="Light mode"
                          className="gap-2 px-3"
                        >
                          <Sun className="h-4 w-4" />
                          <span className="text-xs">Light</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="dark"
                          aria-label="Dark mode"
                          className="gap-2 px-3"
                        >
                          <Moon className="h-4 w-4" />
                          <span className="text-xs">Dark</span>
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="system"
                          aria-label="System mode"
                          className="gap-2 px-3"
                        >
                          <Monitor className="h-4 w-4" />
                          <span className="text-xs">System</span>
                        </ToggleGroupItem>
                      </ToggleGroup>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleThemeSelectClick}
                        className="gap-2"
                      >
                        <Palette className="h-4 w-4" />
                        Color Preset
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label
                        htmlFor="font-select"
                        className="text-sm font-semibold"
                      >
                        Font Family
                      </Label>
                      <Select value={fontFamily} onValueChange={setFontFamily}>
                        <SelectTrigger id="font-select" className="h-9">
                          <SelectValue placeholder="Select a font" />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_FONTS.map((font) => (
                            <SelectItem key={font.id} value={font.id}>
                              {font.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="font-size-slider"
                        className="text-sm font-semibold"
                      >
                        Font Size ({fontSize}px)
                      </Label>
                      <div className="pt-2">
                        <Slider
                          id="font-size-slider"
                          min={12}
                          max={20}
                          step={1}
                          value={[fontSize]}
                          onValueChange={(value) => setFontSize(value[0])}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="animation" className="mt-0 space-y-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-medium">Animation Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Used for new animations. Existing clips are unchanged.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="anim-frames"
                      className="text-sm font-semibold"
                    >
                      Default Frames
                    </Label>
                    <Input
                      id="anim-frames"
                      type="number"
                      min={1}
                      max={100000}
                      value={animFrameCount}
                      onChange={(e) =>
                        setAnimFrameCount(
                          Math.max(1, parseInt(e.target.value) || 1),
                        )
                      }
                      className="h-9 w-32"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="anim-fps" className="text-sm font-semibold">
                      Default FPS
                    </Label>
                    <Input
                      id="anim-fps"
                      type="number"
                      min={1}
                      max={120}
                      value={animFps}
                      onChange={(e) =>
                        setAnimFps(
                          Math.max(
                            1,
                            Math.min(120, parseInt(e.target.value) || 1),
                          ),
                        )
                      }
                      className="h-9 w-32"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="anim-speed"
                      className="text-sm font-semibold"
                    >
                      Default Playback Speed ({animSpeed.toFixed(2)}×)
                    </Label>
                    <div className="w-48 pt-2">
                      <Slider
                        id="anim-speed"
                        min={0.05}
                        max={4}
                        step={0.05}
                        value={[animSpeed]}
                        onValueChange={([v]) => setAnimSpeed(v)}
                      />
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    Duration:{" "}
                    <span className="font-mono font-medium text-foreground">
                      {animDurationSec}s
                    </span>
                  </div>

                  {animSaveError && (
                    <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                      Save failed: {animSaveError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={handleAnimSave}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAnimReset}
                    >
                      Reset to defaults
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="about" className="mt-0 space-y-6">
                <div className="space-y-3 text-center py-4">
                  <div className="flex justify-center">
                    <img
                      src={`${import.meta.env.BASE_URL}compressed/kukla2d.png`}
                      alt="Kukla2D"
                      className="w-36 h-auto"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground font-mono">
                    Version {__APP_VERSION__}
                  </p>
                  <p className="max-w-xs mx-auto text-sm text-balance text-muted-foreground">
                    A local-first, browser-based editor for rigging and
                    animating 2D characters. It combines an approachable
                    workflow with mesh deformation, skeletal animation,
                    constraints, physics, and game-ready export.
                  </p>
                </div>

                <div className="border-t pt-6">
                  <h4 className="text-sm font-semibold mb-3">Credits</h4>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Created by{" "}
                        <a
                          href="https://github.com/wwolanski"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          W.Wolański
                        </a>{" "}
                        2026 — present
                      </p>
                      <div className="mt-2">
                        <a
                          className="github-button"
                          href="https://github.com/wwolanski"
                          data-color-scheme="no-preference: light; light: light; dark: dark;"
                          data-size="large"
                          aria-label="Follow @wwolanski on GitHub"
                        >
                          Follow @wwolanski
                        </a>
                      </div>
                    </div>

                    <div className="border-t pt-3">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Kukla2D began as a fork of{" "}
                        <a
                          href="https://github.com/MangoLion/stretchystudio"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          Stretchy Studio
                        </a>{" "}
                        by{" "}
                        <a
                          href="https://github.com/MangoLion"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-primary hover:underline"
                        >
                          Nguyen Phan
                        </a>
                        . Original MIT license preserved.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
