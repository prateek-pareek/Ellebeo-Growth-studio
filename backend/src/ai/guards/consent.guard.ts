// ============================================================================
// consent.guard.ts — Hard Consent Gate
// Checked TWICE: at API submission and inside worker before processing.
// A job must never proceed without valid consent at both checkpoints.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import type {
  ConsentRecord,
  ConsentValidationResult,
  ConsentRestrictions,
} from '../types/job-payload.types';
import { AI_CONFIG } from '../../config/ai.config';

// Minimal shape expected from the DB consent_records table
interface DBConsentRecord {
  consent_id: string;
  client_id: string;
  tenant_id: string;
  status: string;
  restrictions: unknown;
  granted_at: Date;
  expires_at: Date | null;
  last_updated_at: Date;
  version: number;
  is_current: boolean;
}

export class ConsentGuard {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly io?: SocketServer    // optional — only needed for handleConsentWithdrawal
  ) { }

  // --------------------------------------------------------------------------
  // Checkpoint 1 — Called at API layer before job creation
  // Fetches the latest consent record from DB and validates it.
  // --------------------------------------------------------------------------

  async validateAtSubmission(
    _appointmentId: string,
    clientId: string
  ): Promise<ConsentValidationResult> {
    const record = await this.fetchConsentRecord(clientId);

    if (!record) {
      return {
        valid: false,
        reason: 'not_found',
        activeRestrictions: this.defaultRestrictiveRestrictions(),
      };
    }

    return this.evaluateRecord(record);
  }

  // --------------------------------------------------------------------------
  // Checkpoint 2 — Called inside worker BEFORE processing begins
  // Compares the immutable snapshot (taken at job creation) against the current
  // live DB record. If consent was withdrawn or expired after queuing, block.
  // --------------------------------------------------------------------------

  async validateAtProcessing(
    consentSnapshot: ConsentRecord,
    clientId: string
  ): Promise<ConsentValidationResult> {
    // Always re-fetch from DB — the snapshot may be stale
    const liveRecord = await this.fetchConsentRecord(clientId);

    if (!liveRecord) {
      return {
        valid: false,
        reason: 'not_found',
        activeRestrictions: this.defaultRestrictiveRestrictions(),
      };
    }

    const liveResult = this.evaluateRecord(liveRecord);

    // Even if live record is valid, check if restrictions tightened since snapshot
    if (liveResult.valid) {
      const snapshot = consentSnapshot?.restrictions;
      const live = liveResult.activeRestrictions;

      // Only compare if snapshot has restrictions data
      if (snapshot) {
        const restrictionsTightened =
          (!live.show_face && snapshot.show_face) ||
          (!live.use_name && snapshot.use_name) ||
          (!live.allow_tagging && snapshot.allow_tagging) ||
          (!live.allow_before_after && snapshot.allow_before_after) ||
          (!live.allow_extended_use && snapshot.allow_extended_use);

        if (restrictionsTightened) {
          return {
            valid: false,
            reason: 'restrictions_violated',
            activeRestrictions: live,
          };
        }
      }
    }

    return liveResult;
  }

  // --------------------------------------------------------------------------
  // Consent Withdrawal Handler
  // Called when a DB trigger fires (client withdraws consent).
  // Must:
  //   1. Find all QUEUED / PROCESSING jobs for this client → BLOCKED
  //   2. Find all COMPLETED content records for this client → BLOCKED
  //   3. Emit WebSocket events to affected technicians
  // --------------------------------------------------------------------------

  async handleConsentWithdrawal(clientId: string): Promise<void> {
    // Fetch all generation_jobs for this client that are still active
    const activeJobs = await this.prisma.$queryRaw<
      Array<{ job_id: string; tenant_id: string; state: string }>
    >`
      SELECT job_id, tenant_id, state
      FROM generation_jobs
      WHERE client_id = ${clientId}
        AND state IN ('QUEUED', 'PROCESSING_IMAGE', 'PROCESSING_VISION',
                      'BUILDING_PROMPT', 'GENERATING_TEXT', 'GENERATING_REEL')
    `;

    // Fetch all COMPLETED content items for this client
    const completedContent = await this.prisma.$queryRaw<
      Array<{ content_item_id: string; tenant_id: string }>
    >`
      SELECT ci.content_item_id, ci.tenant_id
      FROM content_items ci
      JOIN generation_jobs gj ON gj.job_id = ci.job_id
      WHERE gj.client_id = ${clientId}
        AND ci.caption_status = 'completed'
    `;

    // Transition all active jobs to BLOCKED
    if (activeJobs.length > 0) {
      const jobIds = activeJobs.map((j: { job_id: string; tenant_id: string; state: string }) => j.job_id);
      await this.prisma.$executeRaw`
        UPDATE generation_jobs
        SET state = 'BLOCKED', updated_at = NOW()
        WHERE job_id = ANY(${jobIds}::uuid[])
      `;
    }

    // Block all completed content items
    if (completedContent.length > 0) {
      const contentIds = completedContent.map((c: { content_item_id: string; tenant_id: string }) => c.content_item_id);
      await this.prisma.$executeRaw`
        UPDATE content_items
        SET caption_status = 'blocked',
            image_status   = 'blocked',
            reel_status    = 'blocked',
            updated_at     = NOW()
        WHERE content_item_id = ANY(${contentIds}::uuid[])
      `;
    }

    // Emit WebSocket events to affected technicians
    if (this.io) {
      const affectedTenants = new Set<string>([
        ...activeJobs.map((j: { tenant_id: string; job_id: string; state: string }) => j.tenant_id),
        ...completedContent.map((c: { content_item_id: string; tenant_id: string }) => c.tenant_id),
      ]);

      for (const tenantId of affectedTenants) {
        const room = AI_CONFIG.redisKeys.socketRoom(tenantId);
        this.io.to(room).emit('consent:withdrawn', {
          clientId,
          message:
            'A client has withdrawn their consent. Related content has been removed from your drafts.',
          affectedJobIds: activeJobs
            .filter((j: { tenant_id: string; job_id: string; state: string }) => j.tenant_id === tenantId)
            .map((j: { tenant_id: string; job_id: string; state: string }) => j.job_id),
          affectedContentIds: completedContent
            .filter((c: { content_item_id: string; tenant_id: string }) => c.tenant_id === tenantId)
            .map((c: { content_item_id: string; tenant_id: string }) => c.content_item_id),
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private async fetchConsentRecord(
    clientId: string
  ): Promise<DBConsentRecord | null> {
    const records = await this.prisma.$queryRaw<DBConsentRecord[]>`
      SELECT
        id            AS consent_id,
        client_id,
        tenant_id,
        status,
        jsonb_build_object(
          'show_face',          allow_show_face,
          'use_name',           allow_use_name,
          'allow_tagging',      allow_tag_social,
          'allow_before_after', allow_marketing_content,
          'allow_extended_use', allow_platform_promotion
        )             AS restrictions,
        granted_at,
        NULL          AS expires_at,
        updated_at    AS last_updated_at,
        1             AS version,
        is_current
      FROM platform.consent_records
      WHERE client_id = ${clientId}::uuid
        AND is_current = true
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    return records[0] ?? null;
  }

  private evaluateRecord(record: DBConsentRecord): ConsentValidationResult {
    // Check status
    if (record.status === 'withdrawn') {
      return {
        valid: false,
        reason: 'withdrawn',
        activeRestrictions: this.defaultRestrictiveRestrictions(),
      };
    }

    // Check expiry
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return {
        valid: false,
        reason: 'expired',
        activeRestrictions: this.defaultRestrictiveRestrictions(),
      };
    }

    // Parse restrictions safely
    const restrictions = this.parseRestrictions(record.restrictions);

    return {
      valid: true,
      activeRestrictions: restrictions,
    };
  }

  private parseRestrictions(raw: unknown): ConsentRestrictions {
    // Safely parse JSON restrictions from DB
    const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

    return {
      show_face: Boolean(r['show_face'] ?? false),
      use_name: Boolean(r['use_name'] ?? false),
      allow_tagging: Boolean(r['allow_tagging'] ?? false),
      allow_before_after: Boolean(r['allow_before_after'] ?? false),
      allow_extended_use: Boolean(r['allow_extended_use'] ?? false),
    };
  }

  /** Default to most restrictive settings when consent cannot be confirmed */
  private defaultRestrictiveRestrictions(): ConsentRestrictions {
    return {
      show_face: false,
      use_name: false,
      allow_tagging: false,
      allow_before_after: false,
      allow_extended_use: false,
    };
  }
}
