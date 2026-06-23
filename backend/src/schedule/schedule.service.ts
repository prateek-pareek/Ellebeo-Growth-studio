import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulePostDto, UpdateScheduledPostDto } from './dto/schedule.dto';

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
        }
      },
      include: {
        contentItem: {
          select: {
            id: true,
            caption: true,
            reelThumbnailUrl: true,
            processedImageUrlFeed: true,
            status: true,
          }
        }
      },
      orderBy: { scheduledFor: 'asc' }
    });

    return {
      posts: posts.map(p => ({
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
      }))
    };
  }

  async schedule(tenantId: string, dto: SchedulePostDto) {
    return this.prisma.scheduledPost.create({
      data: {
        ...dto,
        tenantId,
        scheduledFor: new Date(dto.scheduledFor),
        hashtagsOverride: dto.hashtagsOverride ?? [],
      }
    });
  }

  async updateSchedule(tenantId: string, id: string, dto: UpdateScheduledPostDto) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    return this.prisma.scheduledPost.update({
      where: { id },
      data: {
        ...dto,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      }
    });
  }

  async deleteSchedule(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    return this.prisma.scheduledPost.update({
      where: { id },
      data: { deletedAt: new Date(), publishStatus: 'cancelled' }
    });
  }

  async publishNow(tenantId: string, id: string) {
    const post = await this.prisma.scheduledPost.findUnique({
      where: { id },
      include: {
        contentItem: {
          select: {
            caption: true,
            processedImageUrlFeed: true,
            reelThumbnailUrl: true,
          },
        },
      },
    });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');
    if (!['pending', 'failed'].includes(post.publishStatus)) throw new BadRequestException('Only pending posts can be published');

    const account = await this.prisma.socialAccount.findUnique({ where: { id: post.socialAccountId } });
    if (!account || account.status !== 'connected' || !account.accessToken) {
      throw new BadRequestException('Social account not connected — reconnect and try again');
    }

    const caption  = post.contentItem?.caption ?? '';
    const imageUrl = post.contentItem?.processedImageUrlFeed ?? post.contentItem?.reelThumbnailUrl ?? null;

    try {
      if (account.platform === 'instagram') {
        await this.publishToInstagram(account.platformAccountId!, account.accessToken, imageUrl, caption, post.postFormat);
      } else if (account.platform === 'facebook') {
        await this.publishToFacebook(account.platformAccountId!, account.accessToken, imageUrl, caption);
      } else {
        throw new BadRequestException(`Publishing not supported for platform: ${account.platform}`);
      }

      await this.prisma.scheduledPost.update({
        where: { id },
        data: { publishStatus: 'published', publishedAt: new Date() },
      });

      this.logger.log(`Post ${id} published to ${account.platform}`);
      return { message: 'Published successfully' };
    } catch (err: any) {
      this.logger.error(`Failed to publish post ${id}: ${err.message}`);
      await this.prisma.scheduledPost.update({
        where: { id },
        data: { publishStatus: 'failed' },
      });
      throw err instanceof BadRequestException ? err : new BadRequestException(err.message ?? 'Publishing failed');
    }
  }

  private async publishToInstagram(igUserId: string, accessToken: string, imageUrl: string | null, caption: string, format: string) {
    if (!imageUrl) throw new Error('No image URL available for publishing');

    // Step 1 — create media container
    const isReel = format === 'reel';
    const containerParams: Record<string, string> = {
      caption,
      access_token: accessToken,
    };

    if (isReel) {
      containerParams.media_type = 'REELS';
      containerParams.video_url  = imageUrl;
    } else {
      containerParams.image_url  = imageUrl;
    }

    const containerRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerParams),
    });
    const containerData = await containerRes.json() as any;
    if (!containerData.id) throw new Error(containerData.error?.message ?? 'Failed to create media container');

    // Step 2 — publish container
    const publishRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json() as any;
    if (!publishData.id) throw new Error(publishData.error?.message ?? 'Failed to publish to Instagram');
  }

  private async publishToFacebook(pageId: string, pageToken: string, imageUrl: string | null, caption: string) {
    if (!imageUrl) throw new Error('No image URL available for publishing');

    const res  = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl, caption, access_token: pageToken }),
    });
    const data = await res.json() as any;
    if (!data.id) throw new Error(data.error?.message ?? 'Failed to publish to Facebook');
  }

  async getSocialAccounts(tenantId: string) {
    return this.prisma.socialAccount.findMany({
      where: { tenantId },
    });
  }

  // ── Instagram OAuth ──────────────────────────────────────────────────────

  getInstagramOAuthUrl(tenantId: string, redirectUri: string): string {
    const state = Buffer.from(JSON.stringify({ tenantId, redirectUri })).toString('base64url');
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!,
      redirect_uri:  redirectUri,
      scope:         'instagram_business_basic,instagram_content_publish',
      response_type: 'code',
      state,
    });
    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    this.logger.log(`Instagram OAuth URL generated for tenant ${tenantId}`);
    return url;
  }

  async handleInstagramCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId, redirectUri: decodedRedirectUri } = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) as { tenantId: string; redirectUri?: string };

    const clientId     = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    const redirectUri  = decodedRedirectUri ?? process.env.INSTAGRAM_REDIRECT_URI ?? '';
    if (!clientId || !clientSecret) throw new Error('INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET env var not set on server');

    // 1 — Exchange code for short-lived token
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

    // 2 — Exchange for long-lived token (~60 days)
    const longRes  = await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: clientSecret, access_token: shortToken,
    })}`);
    const longData  = await longRes.json() as any;
    const longToken = longData.access_token ?? shortToken;
    const expiresIn = longData.expires_in   ?? 5184000;

    // 3 — Fetch Instagram profile
    const profileRes  = await fetch(`https://graph.instagram.com/me?${new URLSearchParams({
      fields: 'id,username', access_token: longToken,
    })}`);
    const profileData = await profileRes.json() as any;

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 4 — Upsert into DB
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

  getFacebookOAuthUrl(tenantId: string, redirectUri: string): string {
    const state = Buffer.from(JSON.stringify({ tenantId, platform: 'facebook', redirectUri })).toString('base64url');
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!, // same Facebook App
      redirect_uri:  redirectUri,
      scope:         'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async handleFacebookCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId, redirectUri: decodedRedirectUri } = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) as { tenantId: string; platform?: string; redirectUri?: string };

    const clientId     = process.env.INSTAGRAM_CLIENT_ID!;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET!;
    const redirectUri  = decodedRedirectUri ?? process.env.FACEBOOK_REDIRECT_URI!;

    // 1 — Exchange code for short-lived token
    const tokenUrl  = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code,
    })}`;
    const tokenData = await (await fetch(tokenUrl)).json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? 'Token exchange failed');

    // 2 — Long-lived token
    const longUrl  = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret,
      fb_exchange_token: tokenData.access_token,
    })}`;
    const longData = await (await fetch(longUrl)).json() as any;
    const longToken = longData.access_token ?? tokenData.access_token;
    const expiresIn = longData.expires_in ?? 5184000;

    // 3 — Get Facebook Pages
    const pagesUrl  = `https://graph.facebook.com/v21.0/me/accounts?${new URLSearchParams({
      access_token: longToken,
      fields: 'id,name,access_token,picture,fan_count',
    })}`;
    const pagesData = await (await fetch(pagesUrl)).json() as any;
    const pages: any[] = pagesData.data ?? [];

    if (pages.length === 0) throw new Error('No Facebook Pages found on this account.');

    // Use the first page (most common case for beauty businesses)
    const page           = pages[0];
    const pageToken      = page.access_token;
    const expiresAt      = new Date(Date.now() + expiresIn * 1000);

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
    if (!account.accessToken) throw new BadRequestException('No access token stored — reconnect the account');

    const url = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
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

  // ── Disconnect ───────────────────────────────────────────────────────────

  async disconnectSocialAccount(tenantId: string, id: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!account || account.tenantId !== tenantId) throw new NotFoundException('Account not found');

    return this.prisma.socialAccount.update({
      where: { id },
      data:  { status: 'disconnected', accessToken: null, refreshToken: null },
    });
  }
}
