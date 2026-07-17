import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulePostDto, UpdateScheduledPostDto } from './dto/schedule.dto';
import { publishScheduledQueue, type PublishScheduledJobPayload } from '../ai/queues/queue.definitions';
import { publishScheduledPost } from './publish-post.helper';
import { signOAuthState, verifyOAuthState } from './oauth-state.util';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private prisma: PrismaService) {}

  async getCalendar(tenantId: string, from: string, to: string) {
    const posts = await this.prisma.scheduledPost.findMany({
      where: {
        tenantId,
        deletedAt: null,
        scheduledFor: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: {
        contentItem: {
          select: {
            id: true,
            caption: true,
            reelThumbnailUrl: true,
            processedImageUrlFeed: true,
            status: true,
          },
        },
      },
      orderBy: { scheduledFor: 'asc' },
    });

    return {
      posts: posts.map((p) => ({
        id: p.id,
        scheduledFor: p.scheduledFor.toISOString(),
        platform: p.platform,
        format: p.postFormat,
        contentItem: {
          id: p.contentItem.id,
          caption: p.contentItem.caption,
          thumbnailUrl: p.contentItem.reelThumbnailUrl || p.contentItem.processedImageUrlFeed,
          status: p.contentItem.status,
        },
        publishStatus: p.publishStatus,
      })),
    };
  }

  async schedule(tenantId: string, dto: SchedulePostDto) {
    const scheduledFor = new Date(dto.scheduledFor);

    const post = await this.prisma.scheduledPost.create({
      data: {
        ...dto,
        tenantId,
        scheduledFor,
        hashtagsOverride: dto.hashtagsOverride ?? [],
      },
    });

    // Enqueue a delayed BullMQ job — fires exactly at scheduledFor.
    // jobId = post.id so we can remove/replace it if the user reschedules.
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    await publishScheduledQueue.add(
      'publish',
      { scheduledPostId: post.id, tenantId } satisfies PublishScheduledJobPayload,
      { jobId: post.id, delay },
    );

    this.logger.log(`Scheduled post ${post.id} for ${scheduledFor.toISOString()} (delay ${Math.round(delay / 1000)}s)`);
    return post;
  }

  async updateSchedule(tenantId: string, id: string, dto: UpdateScheduledPostDto) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    const updated = await this.prisma.scheduledPost.update({
      where: { id },
      data: {
        ...dto,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      },
    });

    // Replace the delayed job if the time changed.
    if (dto.scheduledFor) {
      const newTime = new Date(dto.scheduledFor);
      await publishScheduledQueue.remove(id);
      const delay = Math.max(0, newTime.getTime() - Date.now());
      await publishScheduledQueue.add(
        'publish',
        { scheduledPostId: id, tenantId } satisfies PublishScheduledJobPayload,
        { jobId: id, delay },
      );
      this.logger.log(`Rescheduled post ${id} to ${newTime.toISOString()} (delay ${Math.round(delay / 1000)}s)`);
    }

    return updated;
  }

  async deleteSchedule(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    // Remove the delayed job so it doesn't fire after cancellation.
    await publishScheduledQueue.remove(id);

    return this.prisma.scheduledPost.update({
      where: { id },
      data: { deletedAt: new Date(), publishStatus: 'cancelled' },
    });
  }

  // Manual "Publish now" — bypasses the queue, fires immediately.
  async publishNow(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');
    if (!['pending', 'failed'].includes(post.publishStatus)) {
      throw new BadRequestException('Only pending or failed posts can be published');
    }

    // Remove any queued delayed job so it doesn't double-publish.
    await publishScheduledQueue.remove(id);

    try {
      await publishScheduledPost(this.prisma as any, id);
      this.logger.log(`Post ${id} manually published (tenant: ${tenantId})`);
      return { message: 'Published successfully' };
    } catch (err: any) {
      this.logger.error(`Manual publish failed for post ${id}: ${err.message}`);
      await this.prisma.scheduledPost.update({
        where: { id },
        data: { publishStatus: 'failed' },
      });
      throw new BadRequestException(err.message ?? 'Publishing failed');
    }
  }

  async getSocialAccounts(tenantId: string) {
    return this.prisma.socialAccount.findMany({ where: { tenantId } });
  }

  // ── Instagram OAuth ──────────────────────────────────────────────────────

  getInstagramOAuthUrl(tenantId: string, redirectUri: string, mobileRedirectUri?: string): string {
    const statePayload: Record<string, string> = { tenantId, redirectUri };
    if (mobileRedirectUri) statePayload.mobileRedirectUri = mobileRedirectUri;
    const state = signOAuthState(statePayload);
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!,
      redirect_uri:  redirectUri,
      response_type: 'code',
      state,
    });
    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights`;
    this.logger.log(`Instagram OAuth URL generated for tenant ${tenantId}`);
    return url;
  }

  async handleInstagramCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId, redirectUri: decodedRedirectUri } = verifyOAuthState<{ tenantId: string; redirectUri?: string }>(stateRaw);

    const clientId     = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    const redirectUri  = decodedRedirectUri ?? process.env.INSTAGRAM_REDIRECT_URI ?? '';
    if (!clientId || !clientSecret) throw new Error('INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET not set');

    const tokenForm = new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      grant_type: 'authorization_code', redirect_uri: redirectUri, code,
    });
    const tokenRes  = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm.toString(),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error_message ?? tokenData.error?.message ?? 'Token exchange failed');
    const shortToken = tokenData.access_token;

    const longRes  = await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortToken,
    })}`);
    const longData  = await longRes.json() as any;
    const longToken = longData.access_token ?? shortToken;
    const expiresIn = longData.expires_in   ?? 5184000;

    const profileRes  = await fetch(`https://graph.instagram.com/me?${new URLSearchParams({
      fields: 'id,username', access_token: longToken,
    })}`);
    const profileData = await profileRes.json() as any;
    const expiresAt   = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.socialAccount.upsert({
      where:  { unique_platform_per_tenant: { tenantId, platform: 'instagram' } },
      update: {
        status:            'connected',
        platformAccountId: profileData.id,
        accountName:       profileData.username ?? 'Instagram Account',
        accountHandle:     profileData.username ? `@${profileData.username}` : null,
        accessToken:       longToken,
        tokenExpiresAt:    expiresAt,
        tokenRefreshedAt:  new Date(),
        scopesGranted:     ['instagram_business_basic'],
      },
      create: {
        tenantId,
        platform:          'instagram',
        platformAccountId: profileData.id,
        accountName:       profileData.username ?? 'Instagram Account',
        accountHandle:     profileData.username ? `@${profileData.username}` : null,
        status:            'connected',
        accessToken:       longToken,
        tokenExpiresAt:    expiresAt,
        tokenRefreshedAt:  new Date(),
        scopesGranted:     ['instagram_business_basic'],
      },
    });
  }

  // ── Facebook OAuth ───────────────────────────────────────────────────────

  getFacebookOAuthUrl(tenantId: string, redirectUri: string, mobileRedirectUri?: string): string {
    const statePayload: Record<string, string> = { tenantId, platform: 'facebook', redirectUri };
    if (mobileRedirectUri) statePayload.mobileRedirectUri = mobileRedirectUri;
    const state = signOAuthState(statePayload);
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!,
      redirect_uri:  redirectUri,
      scope:         'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async handleFacebookCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId, redirectUri: decodedRedirectUri } = verifyOAuthState<{ tenantId: string; platform?: string; redirectUri?: string }>(stateRaw);

    const clientId     = process.env.INSTAGRAM_CLIENT_ID!;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET!;
    const redirectUri  = decodedRedirectUri ?? process.env.FACEBOOK_REDIRECT_URI!;

    const tokenUrl  = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code,
    })}`;
    const tokenData = await (await fetch(tokenUrl)).json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? 'Token exchange failed');

    const longUrl  = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret,
      fb_exchange_token: tokenData.access_token,
    })}`;
    const longData = await (await fetch(longUrl)).json() as any;
    const longToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in ?? 5184000;

    const pagesUrl  = `https://graph.facebook.com/v21.0/me/accounts?${new URLSearchParams({
      access_token: longToken, fields: 'id,name,access_token,picture,fan_count',
    })}`;
    const pagesData = await (await fetch(pagesUrl)).json() as any;
    const pages: any[] = pagesData.data ?? [];
    if (pages.length === 0) throw new Error('No Facebook Pages found on this account.');

    const page      = pages[0];
    const pageToken = page.access_token;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.socialAccount.upsert({
      where:  { unique_platform_per_tenant: { tenantId, platform: 'facebook' } },
      update: {
        status:            'connected',
        platformAccountId: page.id,
        accountName:       page.name,
        accountHandle:     null,
        profilePictureUrl: page.picture?.data?.url ?? null,
        accessToken:       pageToken,
        tokenExpiresAt:    expiresAt,
        tokenRefreshedAt:  new Date(),
        scopesGranted:     ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata'],
      },
      create: {
        tenantId,
        platform:          'facebook',
        platformAccountId: page.id,
        accountName:       page.name,
        accountHandle:     null,
        profilePictureUrl: page.picture?.data?.url ?? null,
        status:            'connected',
        accessToken:       pageToken,
        tokenExpiresAt:    expiresAt,
        tokenRefreshedAt:  new Date(),
        scopesGranted:     ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata'],
      },
    });
  }

  async refreshInstagramToken(tenantId: string, id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.tenantId !== tenantId) throw new NotFoundException('Account not found');
    if (!account.accessToken) throw new BadRequestException('No access token — reconnect the account');

    const url  = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      grant_type:        'fb_exchange_token',
      client_id:         process.env.INSTAGRAM_CLIENT_ID!,
      client_secret:     process.env.INSTAGRAM_CLIENT_SECRET!,
      fb_exchange_token: account.accessToken,
    })}`;
    const data = await (await fetch(url)).json() as any;
    if (!data.access_token) throw new BadRequestException('Token refresh failed — reconnect the account');

    const expiresAt = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000);
    await this.prisma.socialAccount.update({
      where: { id },
      data:  { accessToken: data.access_token, tokenExpiresAt: expiresAt, tokenRefreshedAt: new Date(), status: 'connected' },
    });
    return { success: true };
  }

  async disconnectSocialAccount(tenantId: string, id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.tenantId !== tenantId) throw new NotFoundException('Account not found');
    return this.prisma.socialAccount.update({
      where: { id },
      data:  { status: 'disconnected', accessToken: null, refreshToken: null },
    });
  }
}
