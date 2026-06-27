import { describe, it, expect } from 'vitest';
import { AudioEnhancementService } from '@/lib/audio/enhancement-service';
import type { EnhancementSettings } from '@/lib/db/schema';

const service = new AudioEnhancementService();

function buildFilters(settings: EnhancementSettings): string[] {
  return service.buildFilterChain(settings);
}

describe('AudioEnhancementService.buildFilterChain', () => {
  it('always includes highpass filter as first filter', () => {
    const filters = buildFilters({});
    expect(filters[0]).toBe('highpass=f=80');
  });

  it('returns only highpass when all options disabled', () => {
    const filters = buildFilters({
      denoise: { enabled: false, strength: 'medium' },
      eq: { enabled: false, preset: 'voice' },
      compress: { enabled: false, preset: 'medium' },
      normalize: { enabled: false, targetLufs: -16 },
    });
    expect(filters).toEqual(['highpass=f=80']);
  });

  describe('denoise', () => {
    it('adds afftdn filter when denoise is enabled', () => {
      const filters = buildFilters({ denoise: { enabled: true, strength: 'medium' } });
      expect(filters.some(f => f.startsWith('afftdn'))).toBe(true);
    });

    it('does not add afftdn when denoise is disabled', () => {
      const filters = buildFilters({ denoise: { enabled: false, strength: 'medium' } });
      expect(filters.some(f => f.startsWith('afftdn'))).toBe(false);
    });

    it('uses weaker noise floor for light strength', () => {
      const light = buildFilters({ denoise: { enabled: true, strength: 'light' } });
      const aggressive = buildFilters({ denoise: { enabled: true, strength: 'aggressive' } });
      const lightFilter = light.find(f => f.startsWith('afftdn'))!;
      const aggressiveFilter = aggressive.find(f => f.startsWith('afftdn'))!;
      const lightNF = parseInt(lightFilter.match(/nf=(-\d+)/)![1]);
      const aggressiveNF = parseInt(aggressiveFilter.match(/nf=(-\d+)/)![1]);
      // More aggressive = more negative noise floor value
      expect(aggressiveNF).toBeLessThan(lightNF);
    });

    it('uses strongest noise floor for aggressive strength', () => {
      const filters = buildFilters({ denoise: { enabled: true, strength: 'aggressive' } });
      const filter = filters.find(f => f.startsWith('afftdn'))!;
      expect(filter).toContain('nf=-35');
    });
  });

  describe('EQ presets', () => {
    it('adds EQ filter for voice preset', () => {
      const filters = buildFilters({ eq: { enabled: true, preset: 'voice' } });
      expect(filters.some(f => f.includes('equalizer'))).toBe(true);
    });

    it('adds EQ filter for clarity preset', () => {
      const filters = buildFilters({ eq: { enabled: true, preset: 'clarity' } });
      expect(filters.some(f => f.includes('equalizer'))).toBe(true);
    });

    it('adds EQ filter for warmth preset', () => {
      const filters = buildFilters({ eq: { enabled: true, preset: 'warmth' } });
      expect(filters.some(f => f.includes('equalizer'))).toBe(true);
    });

    it('does not add EQ filter when eq is disabled', () => {
      const filters = buildFilters({ eq: { enabled: false, preset: 'voice' } });
      expect(filters.some(f => f.includes('equalizer'))).toBe(false);
    });

    it('applies custom EQ when 5 bands provided', () => {
      const filters = buildFilters({
        eq: { enabled: true, preset: 'custom', customBands: [2, -1, 3, -2, 1] },
      });
      const eqFilter = filters.find(f => f.includes('equalizer'));
      expect(eqFilter).toBeDefined();
      // Should include all 5 standard band frequencies
      expect(eqFilter).toContain('f=100');
      expect(eqFilter).toContain('f=500');
      expect(eqFilter).toContain('f=2000');
      expect(eqFilter).toContain('f=5000');
      expect(eqFilter).toContain('f=10000');
    });

    it('skips custom EQ when bands array is insufficient', () => {
      const filters = buildFilters({
        eq: { enabled: true, preset: 'custom', customBands: [2, -1] },
      });
      expect(filters.some(f => f.includes('equalizer'))).toBe(false);
    });

    it('produces different EQ strings for different presets', () => {
      const voice = buildFilters({ eq: { enabled: true, preset: 'voice' } });
      const clarity = buildFilters({ eq: { enabled: true, preset: 'clarity' } });
      const warmth = buildFilters({ eq: { enabled: true, preset: 'warmth' } });
      const voiceEQ = voice.find(f => f.includes('equalizer'));
      const clarityEQ = clarity.find(f => f.includes('equalizer'));
      const warmthEQ = warmth.find(f => f.includes('equalizer'));
      expect(voiceEQ).not.toEqual(clarityEQ);
      expect(voiceEQ).not.toEqual(warmthEQ);
      expect(clarityEQ).not.toEqual(warmthEQ);
    });
  });

  describe('compression', () => {
    it('adds acompressor filter when compression is enabled', () => {
      const filters = buildFilters({ compress: { enabled: true, preset: 'medium' } });
      expect(filters.some(f => f.includes('acompressor'))).toBe(true);
    });

    it('does not add acompressor when compression is disabled', () => {
      const filters = buildFilters({ compress: { enabled: false, preset: 'medium' } });
      expect(filters.some(f => f.includes('acompressor'))).toBe(false);
    });

    it('applies higher ratio for broadcast vs light preset', () => {
      const light = buildFilters({ compress: { enabled: true, preset: 'light' } });
      const broadcast = buildFilters({ compress: { enabled: true, preset: 'broadcast' } });
      const lightFilter = light.find(f => f.includes('acompressor'))!;
      const broadcastFilter = broadcast.find(f => f.includes('acompressor'))!;
      const lightRatio = parseFloat(lightFilter.match(/ratio=(\d+)/)![1]);
      const broadcastRatio = parseFloat(broadcastFilter.match(/ratio=(\d+)/)![1]);
      expect(broadcastRatio).toBeGreaterThan(lightRatio);
    });

    it('includes alimiter for broadcast preset', () => {
      const filters = buildFilters({ compress: { enabled: true, preset: 'broadcast' } });
      expect(filters.some(f => f.includes('alimiter'))).toBe(true);
    });

    it('does not include alimiter for non-broadcast presets', () => {
      const light = buildFilters({ compress: { enabled: true, preset: 'light' } });
      const medium = buildFilters({ compress: { enabled: true, preset: 'medium' } });
      expect(light.some(f => f.includes('alimiter'))).toBe(false);
      expect(medium.some(f => f.includes('alimiter'))).toBe(false);
    });
  });

  describe('normalization', () => {
    it('adds loudnorm filter when normalization is enabled', () => {
      const filters = buildFilters({ normalize: { enabled: true, targetLufs: -16 } });
      expect(filters.some(f => f.startsWith('loudnorm'))).toBe(true);
    });

    it('does not add loudnorm when normalization is disabled', () => {
      const filters = buildFilters({ normalize: { enabled: false, targetLufs: -16 } });
      expect(filters.some(f => f.startsWith('loudnorm'))).toBe(false);
    });

    it('embeds the targetLufs value in the loudnorm filter', () => {
      const filters = buildFilters({ normalize: { enabled: true, targetLufs: -14 } });
      const normFilter = filters.find(f => f.startsWith('loudnorm'))!;
      expect(normFilter).toContain('I=-14');
    });

    it('defaults targetLufs to -16 when not provided', () => {
      // Pass undefined targetLufs via cast to test the default
      const filters = buildFilters({ normalize: { enabled: true, targetLufs: undefined as unknown as number } });
      const normFilter = filters.find(f => f.startsWith('loudnorm'))!;
      expect(normFilter).toContain('I=-16');
    });

    it('normalization is applied last', () => {
      const filters = buildFilters({
        denoise: { enabled: true, strength: 'light' },
        eq: { enabled: true, preset: 'voice' },
        compress: { enabled: true, preset: 'medium' },
        normalize: { enabled: true, targetLufs: -16 },
      });
      const lastFilter = filters[filters.length - 1];
      expect(lastFilter).toMatch(/^loudnorm/);
    });
  });

  describe('filter ordering', () => {
    it('applies filters in the documented order: highpass → denoise → EQ → compress → normalize', () => {
      const filters = buildFilters({
        denoise: { enabled: true, strength: 'medium' },
        eq: { enabled: true, preset: 'voice' },
        compress: { enabled: true, preset: 'medium' },
        normalize: { enabled: true, targetLufs: -16 },
      });
      const highpassIdx = filters.findIndex(f => f.startsWith('highpass'));
      const denoiseIdx = filters.findIndex(f => f.startsWith('afftdn'));
      const eqIdx = filters.findIndex(f => f.includes('equalizer'));
      const compressIdx = filters.findIndex(f => f.includes('acompressor'));
      const normalizeIdx = filters.findIndex(f => f.startsWith('loudnorm'));
      expect(highpassIdx).toBeLessThan(denoiseIdx);
      expect(denoiseIdx).toBeLessThan(eqIdx);
      expect(eqIdx).toBeLessThan(compressIdx);
      expect(compressIdx).toBeLessThan(normalizeIdx);
    });
  });

  describe('getDefaultSettings', () => {
    it('returns settings with normalize enabled at -16 LUFS', () => {
      const defaults = AudioEnhancementService.getDefaultSettings();
      expect(defaults.normalize?.enabled).toBe(true);
      expect(defaults.normalize?.targetLufs).toBe(-16);
    });

    it('default settings produce a valid filter chain', () => {
      const defaults = AudioEnhancementService.getDefaultSettings();
      const filters = buildFilters(defaults);
      expect(filters.length).toBeGreaterThan(1);
      expect(filters[0]).toBe('highpass=f=80');
    });
  });
});
