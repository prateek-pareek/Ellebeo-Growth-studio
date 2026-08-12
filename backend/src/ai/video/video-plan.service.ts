// ============================================================================
// video-plan.service.ts — the Phase 8 tweak/review/publish API surface.
// Structured field edits only (reorder scenes, edit text, swap asset url,
// toggle voiceover, change music mood) — not a timeline editor, per spec.
// Approve enqueues the Phase 2 render job; publish is deliberately NOT
// reimplemented here — once rendered, the webhook (Phase 2) already syncs
// outputUrl into ContentItem.finalVideoUrl, so the existing schedule/publish
// flow (schedule.controller.ts) picks it up unchanged, same reuse as Phase 2.
// ============================================================================

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { parseVideoPlan, VideoPlan } from './video-plan.schema';
import { videoRenderQueue } from '../queues/queue.definitions';
import { AI_CONFIG } from '../../config/ai.config';
import type { UpdateVideoPlanDto } from './dto/video-plan.dto';

@Injectable()
export class VideoPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async listVideoPlans(tenantId: string, status?: string) {
    return this.prisma.videoPlan.findMany({
      where: { tenantId, ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVideoPlan(tenantId: string, id: string) {
    const row = await this.prisma.videoPlan.findUnique({ where: { id } });
    if (!row || row.tenantId !== tenantId) {
      throw new NotFoundException('Video plan not found');
    }
    return row;
  }

  async updateVideoPlan(tenantId: string, id: string, dto: UpdateVideoPlanDto) {
    const row = await this.getVideoPlan(tenantId, id);
    if (row.status === 'rendering' || row.status === 'rendered' || row.status === 'published') {
      throw new BadRequestException(`Cannot edit a video plan in status "${row.status}"`);
    }

    let plan = parseVideoPlan(row.plan);
    plan = applySceneEdits(plan, dto);
    plan = applyReorder(plan, dto.sceneOrder);
    plan = applyAudioEdits(plan, dto);
    plan = { ...plan, status: 'edited' };

    const updated = await this.prisma.videoPlan.update({
      where: { id },
      data: { plan, status: 'edited', durationSeconds: plan.durationSeconds },
    });
    return updated;
  }

  async approveVideoPlan(tenantId: string, id: string) {
    const row = await this.getVideoPlan(tenantId, id);
    if (row.status === 'rendering' || row.status === 'rendered') {
      throw new BadRequestException(`Video plan is already ${row.status}`);
    }

    const plan = { ...parseVideoPlan(row.plan), status: 'edited' as const };
    const updated = await this.prisma.videoPlan.update({
      where: { id },
      data: { plan, status: 'edited' },
    });

    await videoRenderQueue.add(
      `video-render:${id}`,
      { videoPlanId: id, tenantId },
      { jobId: id, ...AI_CONFIG.queues.videoRender.defaultJobOptions },
    );

    return updated;
  }
}

function applySceneEdits(plan: VideoPlan, dto: UpdateVideoPlanDto): VideoPlan {
  if (!dto.scenes || dto.scenes.length === 0) return plan;

  const scenesByIndex = new Map(plan.scenes.map((s) => [s.index, s]));
  for (const edit of dto.scenes) {
    const scene = scenesByIndex.get(edit.index);
    if (!scene) {
      throw new BadRequestException(`No scene at index ${edit.index}`);
    }
    if (edit.headline !== undefined) scene.text.headline = edit.headline;
    if (edit.caption !== undefined) scene.text.caption = edit.caption;
    if (edit.assetUrl !== undefined) scene.asset.url = edit.assetUrl;
  }

  return parseVideoPlan({ ...plan, scenes: Array.from(scenesByIndex.values()).sort((a, b) => a.index - b.index) });
}

function applyReorder(plan: VideoPlan, sceneOrder: number[] | undefined): VideoPlan {
  if (!sceneOrder || sceneOrder.length === 0) return plan;

  if (sceneOrder.length !== plan.scenes.length || new Set(sceneOrder).size !== plan.scenes.length) {
    throw new BadRequestException('sceneOrder must contain every current scene index exactly once');
  }

  const byOldIndex = new Map(plan.scenes.map((s) => [s.index, s]));
  const reordered = sceneOrder.map((oldIndex, newIndex) => {
    const scene = byOldIndex.get(oldIndex);
    if (!scene) {
      throw new BadRequestException(`sceneOrder references unknown index ${oldIndex}`);
    }
    return { ...scene, index: newIndex };
  });

  return parseVideoPlan({ ...plan, scenes: reordered });
}

function applyAudioEdits(plan: VideoPlan, dto: UpdateVideoPlanDto): VideoPlan {
  if (dto.voiceoverEnabled === undefined && dto.musicMood === undefined) return plan;

  const audio = {
    ...plan.audio,
    voiceover: dto.voiceoverEnabled === undefined ? plan.audio.voiceover : { ...plan.audio.voiceover, enabled: dto.voiceoverEnabled },
    music: dto.musicMood === undefined ? plan.audio.music : { ...plan.audio.music, mood: dto.musicMood },
  };

  return parseVideoPlan({ ...plan, audio });
}
