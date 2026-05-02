// ============================================================================
// reel-assembler.service.ts — Full Reel Pipeline Orchestrator
// Orchestrates: Music → Voiceover → Shotstack render → S3 upload
// A Reel failure MUST NOT fail the entire content pack.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import { ShotstackService } from './shotstack.service';
import { ElevenLabsService } from './elevenlabs.service';
import { PixabayMusicService } from './pixabay-music.service';
import { AI_CONFIG } from '../../config/ai.config';
import type { ReelResult, ReelScriptResult } from '../types/chain-output.types';
import type { BrandDNARecord } from '../types/job-payload.types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';

export class ReelAssemblerService {
  private readonly shotstackService: ShotstackService;
  private readonly elevenLabsService: ElevenLabsService;
  private readonly pixabayMusicService: PixabayMusicService;
  private readonly s3: S3Client;

  constructor(private readonly prisma: PrismaClient) {
    this.shotstackService = new ShotstackService();
    this.elevenLabsService = new ElevenLabsService();
    // PixabayMusicService requires Redis for caching — instantiate with a lazy getter
    // The redis client is imported at the module level
    const { getRedisClient } = require('../../config/redis.client') as { getRedisClient: () => import('ioredis').default };
    this.pixabayMusicService = new PixabayMusicService(getRedisClient());
    this.s3 = new S3Client({
      region: process.env['AWS_REGION'] ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
      },
    });
  }

  // --------------------------------------------------------------------------
  // Main Assembly Pipeline
  // --------------------------------------------------------------------------

  async assemble(params: {
    jobId: string;
    contentItemId: string;
    tenantId: string;
    beforeImageUrl: string;
    afterImageUrl: string;
    hookSentence: string;
    brandDNA: BrandDNARecord;
    reelScript: ReelScriptResult | null;
    includeVoiceover: boolean;
    includeMusic: boolean;
  }): Promise<ReelResult> {
    const {
      jobId, contentItemId, tenantId,
      beforeImageUrl, afterImageUrl, hookSentence,
      brandDNA, reelScript, includeVoiceover, includeMusic,
    } = params;

    // Step 3: Select background music
    let musicTrackUrl: string | null = null;
    let musicTrackId: string | null = null;
    let musicTrackTitle: string | null = null;

    if (includeMusic) {
      const track = await this.pixabayMusicService.selectTrack(
        tenantId,
        brandDNA.moodTag
      );
      if (track) {
        musicTrackUrl = track.cdnUrl;
        musicTrackId = track.trackId;
        musicTrackTitle = track.title;
      }
    }

    // Step 4: Generate voiceover
    let voiceoverUrl: string | null = null;
    let totalDurationSeconds = 5; // before + after (2s + 3s)

    if (includeVoiceover && reelScript) {
      const voiceover = await this.elevenLabsService.generateVoiceover({
        script: reelScript.script,
        voiceId: reelScript.elevenLabsVoiceSettings.voiceId,
        stability: reelScript.elevenLabsVoiceSettings.stability,
        similarityBoost: reelScript.elevenLabsVoiceSettings.similarityBoost,
        style: reelScript.elevenLabsVoiceSettings.style,
      });
      voiceoverUrl = voiceover.audioCdnUrl;
      totalDurationSeconds = Math.max(totalDurationSeconds, voiceover.durationSeconds + 0.5);
    }

    // Step 5: Build Shotstack render JSON
    const shotStackCfg = AI_CONFIG.shotstack;

    const renderJson = this.shotstackService.buildRenderJson({
      beforeImageUrl,
      afterImageUrl,
      hookSentence,
      brandPrimaryColour: brandDNA.primaryBrandColour,
      brandSecondaryColour: brandDNA.secondaryBrandColour,
      musicTrackUrl,
      musicVolume: shotStackCfg.musicVolume,
      voiceoverUrl,
      voiceoverVolume: shotStackCfg.voiceoverVolume,
      beforeDurationSec: shotStackCfg.beforeImageDurationSec,
      afterDurationSec: shotStackCfg.afterImageDurationSec,
      textOverlayAppearSec: shotStackCfg.textOverlayAppearSec,
      outputResolution: shotStackCfg.outputResolution,
      outputFps: shotStackCfg.outputFps,
    });

    // Step 6: Submit to Shotstack
    const renderId = await this.shotstackService.submitRender(renderJson);

    // Step 7: Poll for completion
    const renderResult = await this.shotstackService.pollRenderStatus(renderId);

    // Step 8: Download MP4 and upload to S3
    const s3Key = `reels/${tenantId}/${jobId}/${randomUUID()}.mp4`;
    await this.downloadAndUploadToS3(renderResult.url, s3Key);

    const cdnUrl = `https://${process.env['S3_BUCKET_NAME']}.s3.${process.env['AWS_REGION']}.amazonaws.com/${s3Key}`;

    // Step 8 (continued): Persist to content_items
    await this.persistReelResult({
      contentItemId,
      s3Key,
      cdnUrl,
      durationSeconds: totalDurationSeconds,
      hasVoiceover: includeVoiceover && !!voiceoverUrl,
      hasMusic: includeMusic && !!musicTrackUrl,
      musicTrackId,
      musicTrackTitle,
      shotstackRenderId: renderId,
    });

    return {
      s3Key,
      cdnUrl,
      durationSeconds: totalDurationSeconds,
      hasVoiceover: includeVoiceover && !!voiceoverUrl,
      hasMusic: includeMusic && !!musicTrackUrl,
      musicTrackId,
      musicTrackTitle,
      shotstackRenderId: renderId,
    };
  }

  // --------------------------------------------------------------------------
  // Download MP4 from Shotstack CDN and upload to S3
  // --------------------------------------------------------------------------

  private async downloadAndUploadToS3(videoUrl: string, s3Key: string): Promise<void> {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new ReelAssemblerError(`Failed to download video from Shotstack: ${response.statusText}`);
    }

    const buffer = await response.buffer();

    await this.s3.send(new PutObjectCommand({
      Bucket: process.env['S3_BUCKET_NAME'],
      Key: s3Key,
      Body: buffer,
      ContentType: 'video/mp4',
    }));
  }

  // --------------------------------------------------------------------------
  // Persist reel result to content_items
  // --------------------------------------------------------------------------

  private async persistReelResult(params: {
    contentItemId: string;
    s3Key: string;
    cdnUrl: string;
    durationSeconds: number;
    hasVoiceover: boolean;
    hasMusic: boolean;
    musicTrackId: string | null;
    musicTrackTitle: string | null;
    shotstackRenderId: string;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE content_items
      SET reel_s3_key       = ${params.s3Key},
          reel_cdn_url       = ${params.cdnUrl},
          reel_duration_sec  = ${params.durationSeconds},
          has_voiceover      = ${params.hasVoiceover},
          has_music          = ${params.hasMusic},
          music_track_id     = ${params.musicTrackId},
          music_track_title  = ${params.musicTrackTitle},
          reel_status        = 'completed',
          updated_at         = NOW()
      WHERE content_item_id = ${params.contentItemId}::uuid
    `;
  }
}

export class ReelAssemblerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReelAssemblerError';
  }
}
