"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Volume2,
  Wand2,
  Check,
  RefreshCw,
  Play,
  Pause,
  Sliders,
  Sparkles,
  Radio,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

interface EnhancementPreset {
  id: string;
  name: string;
  description: string;
  settings: any;
}

interface AudioEnhancementPanelProps {
  projectId: string;
  onEnhanced?: (enhancedUrl: string) => void;
  className?: string;
}

export function AudioEnhancementPanel({
  projectId,
  onEnhanced,
  className,
}: AudioEnhancementPanelProps) {
  const [isEnhanced, setIsEnhanced] = useState(false);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [presets, setPresets] = useState<EnhancementPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>("podcast_standard");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);

  const togglePreviewPlayback = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPreviewPlaying(true);
    } else {
      audio.pause();
      setIsPreviewPlaying(false);
    }
  };

  // Default presets
  const defaultPresets: EnhancementPreset[] = [
    {
      id: "podcast_standard",
      name: "Podcast Padrao",
      description: "Configuracao otimizada para podcasts",
      settings: {
        normalize: { enabled: true, targetLufs: -16 },
        denoise: { enabled: true, strength: "medium" },
        eq: { enabled: true, preset: "voice" },
        compress: { enabled: true, preset: "medium" },
        removeFillers: false,
      },
    },
    {
      id: "voice_clarity",
      name: "Voz Clara",
      description: "Maximiza clareza da voz",
      settings: {
        normalize: { enabled: true, targetLufs: -14 },
        denoise: { enabled: true, strength: "aggressive" },
        eq: { enabled: true, preset: "clarity" },
        compress: { enabled: true, preset: "light" },
        removeFillers: false,
      },
    },
    {
      id: "broadcast_ready",
      name: "Pronto para Radio",
      description: "Niveis consistentes estilo broadcast",
      settings: {
        normalize: { enabled: true, targetLufs: -16 },
        denoise: { enabled: true, strength: "medium" },
        eq: { enabled: true, preset: "warmth" },
        compress: { enabled: true, preset: "broadcast" },
        removeFillers: false,
      },
    },
    {
      id: "minimal",
      name: "Minimo",
      description: "Apenas normalizacao basica",
      settings: {
        normalize: { enabled: true, targetLufs: -16 },
        denoise: { enabled: false, strength: "light" },
        eq: { enabled: false, preset: "voice" },
        compress: { enabled: false, preset: "light" },
        removeFillers: false,
      },
    },
  ];

  // Custom settings
  const [settings, setSettings] = useState<{
    normalize: { enabled: boolean; targetLufs: number };
    denoise: { enabled: boolean; strength: "light" | "medium" | "aggressive" };
    eq: { enabled: boolean; preset: "voice" | "clarity" | "warmth" };
    compress: { enabled: boolean; preset: "light" | "medium" | "broadcast" };
    removeFillers: boolean;
  }>({
    normalize: { enabled: true, targetLufs: -16 },
    denoise: { enabled: true, strength: "medium" },
    eq: { enabled: true, preset: "voice" },
    compress: { enabled: true, preset: "medium" },
    removeFillers: false,
  });

  // Load enhancement status
  useEffect(() => {
    loadStatus();
  }, [projectId]);

  const loadStatus = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/enhance`);
      const data = await response.json();

      if (data.success) {
        setIsEnhanced(data.isEnhanced);
        setEnhancedUrl(data.enhancedAudioUrl);
        // Use presets from API or default
        setPresets(data.presets?.length > 0 ? data.presets : defaultPresets);
        if (data.currentSettings) {
          setSettings(data.currentSettings);
        }
      } else {
        // Use default presets if API fails
        setPresets(defaultPresets);
      }
    } catch (error) {
      console.error("Error loading enhancement status:", error);
      // Use default presets on error
      setPresets(defaultPresets);
    }
  };

  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setSettings(preset.settings);
    }
  };

  const generatePreview = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings,
          preview: true,
          previewDuration: 10,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPreviewUrl(data.previewUrl);
        toast.success("Preview gerado!");
      } else {
        toast.error(data.error || "Erro ao gerar preview");
      }
    } catch (error) {
      console.error("Error generating preview:", error);
      toast.error("Erro ao gerar preview");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyEnhancements = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: selectedPreset,
          settings,
          preview: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setIsEnhanced(true);
        setEnhancedUrl(data.enhancedAudioUrl);
        onEnhanced?.(data.enhancedAudioUrl);
        toast.success("Audio melhorado com sucesso!");
      } else {
        toast.error(data.error || "Erro ao aplicar melhorias");
      }
    } catch (error) {
      console.error("Error applying enhancements:", error);
      toast.error("Erro ao aplicar melhorias");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeEnhancements = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/enhance`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setIsEnhanced(false);
        setEnhancedUrl(null);
        toast.success("Melhorias removidas");
      }
    } catch (error) {
      console.error("Error removing enhancements:", error);
    }
  };

  const presetIcons: Record<string, React.ReactNode> = {
    podcast_standard: <Mic className="h-4 w-4" />,
    voice_clarity: <Sparkles className="h-4 w-4" />,
    broadcast_ready: <Radio className="h-4 w-4" />,
    minimal: <Sliders className="h-4 w-4" />,
  };

  return (
    <div className={cn("flex flex-col h-full bg-zinc-900", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-purple-400" />
          <h3 className="font-semibold text-white">Melhoria de Audio</h3>
        </div>
        {isEnhanced && (
          <span className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">
            <Check className="h-3 w-3" />
            Aplicado
          </span>
        )}
      </div>

      {/* Presets */}
      <div className="p-4 border-b border-zinc-800">
        <p className="text-xs text-zinc-500 mb-3">Presets</p>
        <div className="grid grid-cols-2 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border transition-all",
                selectedPreset === preset.id
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-zinc-700 hover:border-zinc-600 bg-zinc-800/50"
              )}
            >
              <div
                className={cn(
                  "p-2 rounded-lg",
                  selectedPreset === preset.id
                    ? "bg-purple-500 text-white"
                    : "bg-zinc-700 text-zinc-400"
                )}
              >
                {presetIcons[preset.id] || <Sliders className="h-4 w-4" />}
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white">
                  {preset.name}
                </div>
                <div className="text-xs text-zinc-500">{preset.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Normalize */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Normalizar Volume</span>
            </div>
            <Switch
              checked={settings.normalize.enabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  normalize: { ...s.normalize, enabled: checked },
                }))
              }
            />
          </div>
          {settings.normalize.enabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Volume alvo (LUFS)</span>
                <span>{settings.normalize.targetLufs} LUFS</span>
              </div>
              <Slider
                value={[settings.normalize.targetLufs]}
                min={-24}
                max={-10}
                step={1}
                onValueChange={([value]) =>
                  setSettings((s) => ({
                    ...s,
                    normalize: { ...s.normalize, targetLufs: value },
                  }))
                }
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Denoise */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Remover Ruido</span>
            </div>
            <Switch
              checked={settings.denoise.enabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  denoise: { ...s.denoise, enabled: checked },
                }))
              }
            />
          </div>
          {settings.denoise.enabled && (
            <div className="flex gap-2">
              {(["light", "medium", "aggressive"] as const).map((strength) => (
                <button
                  key={strength}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      denoise: { ...s.denoise, strength },
                    }))
                  }
                  className={cn(
                    "flex-1 py-2 text-xs rounded-lg transition-colors",
                    settings.denoise.strength === strength
                      ? "bg-purple-500 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                  )}
                >
                  {strength === "light" && "Leve"}
                  {strength === "medium" && "Medio"}
                  {strength === "aggressive" && "Forte"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* EQ */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Equalizacao</span>
            </div>
            <Switch
              checked={settings.eq.enabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  eq: { ...s.eq, enabled: checked },
                }))
              }
            />
          </div>
          {settings.eq.enabled && (
            <div className="flex gap-2">
              {(["voice", "clarity", "warmth"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      eq: { ...s.eq, preset },
                    }))
                  }
                  className={cn(
                    "flex-1 py-2 text-xs rounded-lg transition-colors",
                    settings.eq.preset === preset
                      ? "bg-purple-500 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                  )}
                >
                  {preset === "voice" && "Voz"}
                  {preset === "clarity" && "Clareza"}
                  {preset === "warmth" && "Calor"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Compression */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-white">Compressao</span>
            </div>
            <Switch
              checked={settings.compress.enabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  compress: { ...s.compress, enabled: checked },
                }))
              }
            />
          </div>
          {settings.compress.enabled && (
            <div className="flex gap-2">
              {(["light", "medium", "broadcast"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      compress: { ...s.compress, preset },
                    }))
                  }
                  className={cn(
                    "flex-1 py-2 text-xs rounded-lg transition-colors",
                    settings.compress.preset === preset
                      ? "bg-purple-500 text-white"
                      : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                  )}
                >
                  {preset === "light" && "Leve"}
                  {preset === "medium" && "Medio"}
                  {preset === "broadcast" && "Radio"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-zinc-800 space-y-2">
        {/* Preview player */}
        {previewUrl && (
          <div className="flex items-center gap-3 rounded-lg bg-zinc-800/60 border border-zinc-700 px-3 py-2">
            <button
              onClick={togglePreviewPlayback}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-500 text-white hover:bg-purple-400 transition-colors cursor-pointer"
              aria-label={isPreviewPlaying ? "Pausar preview" : "Tocar preview"}
            >
              {isPreviewPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-zinc-200">Preview (10s)</p>
              <p className="truncate text-[11px] text-zinc-500">
                Ouça antes de aplicar as melhorias
              </p>
            </div>
            <audio
              ref={previewAudioRef}
              src={previewUrl}
              onEnded={() => setIsPreviewPlaying(false)}
              onPause={() => setIsPreviewPlaying(false)}
              onPlay={() => setIsPreviewPlaying(true)}
              className="hidden"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={generatePreview}
            disabled={isProcessing}
            className="flex-1 border-zinc-700"
          >
            {isProcessing ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Preview
          </Button>
          <Button
            onClick={applyEnhancements}
            disabled={isProcessing}
            className="flex-1 bg-purple-500 hover:bg-purple-400"
          >
            {isProcessing ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Aplicar
          </Button>
        </div>

        {isEnhanced && (
          <Button
            variant="ghost"
            onClick={removeEnhancements}
            className="w-full text-zinc-400 hover:text-red-400"
          >
            Remover Melhorias
          </Button>
        )}
      </div>
    </div>
  );
}
