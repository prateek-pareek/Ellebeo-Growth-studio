import {
  CompositionQualityController,
  matchesTemplateSlot,
} from './composition-quality-controller';
import { LayoutConstraints } from './layout-engine';

const constraints: LayoutConstraints = {
  safeX: 48,
  safeY: 48,
  maxWidth: 984,
  contentMaxWidth: 984,
  margins: { top: 48, bottom: 80, left: 48, right: 48 },
};

describe('cleanliness-first QC', () => {
  const qc = new CompositionQualityController();

  it('matchesTemplateSlot still describes a recipe idea', () => {
    expect(matchesTemplateSlot(
      { x: 140, y: 430, width: 800, height: 120 },
      1080,
      1080,
      'center',
    )).toBe(true);
    expect(matchesTemplateSlot(
      { x: 140, y: 880, width: 800, height: 100 },
      1080,
      1080,
      'center',
    )).toBe(false);
  });

  it('accepts a clean centered image_hero headline', () => {
    const result = qc.evaluateVisualQuality({
      boxes: [{
        role: 'heading',
        box: { x: 140, y: 430, width: 800, height: 120 },
        fontSize: 64,
        templateAnchor: 'center',
      }],
      constraints,
      canvasW: 1080,
      canvasH: 1080,
      intent: { visualPriority: 'image_hero', readingFlow: 'center_down' },
    });

    expect(result.issues).not.toContain('reading_flow_band');
    expect(result.issues).not.toContain('template_slot_miss');
    expect(result.needsSpatialEscalation).toBe(false);
    expect(result.pass).toBe(true);
  });

  it('does not punish a clean headline that left the recipe slot', () => {
    const result = qc.evaluateVisualQuality({
      boxes: [{
        role: 'heading',
        box: { x: 140, y: 880, width: 800, height: 90 },
        fontSize: 64,
        templateAnchor: 'center',
      }],
      constraints,
      canvasW: 1080,
      canvasH: 1080,
      intent: { visualPriority: 'image_hero', readingFlow: 'center_down' },
    });

    expect(result.issues).not.toContain('template_slot_miss');
    expect(result.needsSpatialEscalation).toBe(false);
    expect(result.pass).toBe(true);
  });

  it('still accepts a bottom_center headline when that slot is clean', () => {
    const result = qc.evaluateVisualQuality({
      boxes: [{
        role: 'heading',
        box: { x: 120, y: 820, width: 840, height: 90 },
        fontSize: 56,
        templateAnchor: 'bottom_center',
      }],
      constraints,
      canvasW: 1080,
      canvasH: 1080,
      intent: { visualPriority: 'image_hero', readingFlow: 'center_down' },
    });

    expect(result.pass).toBe(true);
    expect(result.needsSpatialEscalation).toBe(false);
  });
});
