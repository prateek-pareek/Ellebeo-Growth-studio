// ============================================================================
// slideshow-plan-builder.ts — trivial rule-based Video Plan builder.
// De-risks Phase 2: proves the deterministic render core works before any
// agent exists. No LLM calls. One image per scene, evenly timed, Ken Burns +
// fade — the cheapest of the three video types and the pipeline default.
// Phase 3's Director+Script agents replace this rule-based approach for
// scene pacing/copy, but the render core stays exactly what this builds.
// ============================================================================

import { VideoPlan, parseVideoPlan } from './video-plan.schema';
import { DEFAULT_DURATION_SECONDS, MAX_SCENE_DURATION_SECONDS, MIN_SCENE_DURATION_SECONDS } from './video-plan.constants';

export interface BuildSlideshowPlanParams {
  technicianId: string;
  brandDnaRef: string;
  imageUrls: string[];
  objective: VideoPlan['objective'];
  headlines?: (string | null)[];
  captions?: (string | null)[];
  brandFont?: string | null;
  brandPalette?: string[];
  totalDurationSeconds?: number;
  medicalAesthetics?: boolean;
}

export class SlideshowPlanBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlideshowPlanBuilderError';
  }
}

export function buildSlideshowPlan(params: BuildSlideshowPlanParams): VideoPlan {
  const { imageUrls, headlines = [], captions = [] } = params;

  if (imageUrls.length === 0) {
    throw new SlideshowPlanBuilderError('At least one image is required to build a slideshow plan');
  }

  const totalDuration = params.totalDurationSeconds ?? DEFAULT_DURATION_SECONDS;
  const perScene = Math.min(
    MAX_SCENE_DURATION_SECONDS,
    Math.max(MIN_SCENE_DURATION_SECONDS, Math.round(totalDuration / imageUrls.length)),
  );

  const scenes = imageUrls.map((url, index) => ({
    index,
    durationSeconds: perScene,
    asset: { kind: 'image' as const, url },
    motion: 'ken_burns' as const,
    text: { headline: headlines[index] ?? null, caption: captions[index] ?? null, position: 'bottom' as const },
    transitionOut: index === imageUrls.length - 1 ? ('fade' as const) : ('fade' as const),
  }));

  const raw = {
    technicianId: params.technicianId,
    brandDnaRef: params.brandDnaRef,
    videoType: 'slideshow',
    durationSeconds: perScene * imageUrls.length,
    objective: params.objective,
    scenes,
    audio: { voiceover: { enabled: false }, music: {} },
    captions: { enabled: true, style: 'minimal', burnedIn: true },
    branding: { palette: params.brandPalette ?? [], font: params.brandFont ?? null },
    compliance: { medicalAesthetics: params.medicalAesthetics ?? false },
    critic: {},
    render: {},
    meta: { createdAt: new Date().toISOString() },
  };

  return parseVideoPlan(raw);
}
