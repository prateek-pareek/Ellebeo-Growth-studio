import { parseVideoPlan, type VideoPlan, type VideoStatus } from '../contract';

export function withPlanStatus(
  plan: VideoPlan,
  status: VideoStatus,
  render?: Partial<VideoPlan['render']>,
): VideoPlan {
  return parseVideoPlan({
    ...plan,
    status,
    render: {
      ...plan.render,
      ...render,
    },
  });
}

export function videoJobDenormalizedFields(plan: VideoPlan) {
  const first = plan.scenes[0];
  return {
    videoType: plan.videoType,
    status: plan.status,
    objective: plan.objective,
    captionStyle: plan.captions.style,
    primaryAssetKind: first?.asset.kind ?? null,
    primaryMotion: first?.motion ?? null,
    primaryTransition: first?.transitionOut ?? null,
    primaryTextPosition: first?.text.position ?? null,
    planVersion: plan.planVersion,
    plan: plan as object,
    shotstackRenderId: plan.render.renderId,
    outputUrl: plan.render.outputUrl,
  };
}
