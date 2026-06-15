import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulePostDto, UpdateScheduledPostDto } from './dto/schedule.dto';

@Injectable()
export class ScheduleService {
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
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post || post.tenantId !== tenantId) throw new NotFoundException('Post not found');

    if (post.publishStatus !== 'pending') {
      throw new BadRequestException('Only pending posts can be published');
    }

    // Here we would enqueue a job to the publishing worker
    // this.publisherQueue.add('publish', { postId: post.id });

    return { message: 'Publishing initiated' };
  }

  async getSocialAccounts(tenantId: string) {
    return this.prisma.socialAccount.findMany({
      where: { tenantId },
    });
  }

  // ── Instagram OAuth ──────────────────────────────────────────────────────

  getInstagramOAuthUrl(tenantId: string): string {
    const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!,
      redirect_uri:  process.env.INSTAGRAM_REDIRECT_URI!,
      scope:         'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async handleInstagramCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId } = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) as { tenantId: string };

    const clientId     = process.env.INSTAGRAM_CLIENT_ID!;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET!;
    const redirectUri  = process.env.INSTAGRAM_REDIRECT_URI!;

    // 1 — Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code,
    })}`;
    const tokenRes  = await fetch(tokenUrl);
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error?.message ?? 'Token exchange failed');
    const shortToken = tokenData.access_token;

    // 2 — Exchange for long-lived token (~60 days)
    const longUrl = `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret,
      fb_exchange_token: shortToken,
    })}`;
    const longRes  = await fetch(longUrl);
    const longData = await longRes.json() as any;
    const longToken  = longData.access_token ?? shortToken;
    const expiresIn  = longData.expires_in  ?? 5184000; // 60 days fallback

    // 3 — Get Facebook Pages with Instagram Business Account
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?${new URLSearchParams({
      access_token: longToken,
      fields: 'id,name,access_token,instagram_business_account',
    })}`;
    const pagesData = await (await fetch(pagesUrl)).json() as any;
    const pages: any[] = pagesData.data ?? [];

    let igAccountId: string | null       = null;
    let pageAccessToken: string | null   = null;

    for (const page of pages) {
      if (page.instagram_business_account?.id) {
        igAccountId     = page.instagram_business_account.id;
        pageAccessToken = page.access_token;
        break;
      }
    }

    if (!igAccountId || !pageAccessToken) {
      throw new Error('No Instagram Business account found. Please link an Instagram Professional account to a Facebook Page first.');
    }

    // 4 — Fetch Instagram account details
    const igUrl  = `https://graph.facebook.com/v21.0/${igAccountId}?${new URLSearchParams({
      fields: 'id,username,name,profile_picture_url',
      access_token: pageAccessToken,
    })}`;
    const igData = await (await fetch(igUrl)).json() as any;

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // 5 — Upsert into DB
    await this.prisma.socialAccount.upsert({
      where:  { unique_platform_per_tenant: { tenantId, platform: 'instagram' } },
      update: {
        status:              'connected',
        platformAccountId:   igAccountId,
        accountName:         igData.name     ?? igData.username ?? 'Instagram Account',
        accountHandle:       igData.username ? `@${igData.username}` : null,
        profilePictureUrl:   igData.profile_picture_url ?? null,
        accessToken:         pageAccessToken,
        tokenExpiresAt:      expiresAt,
        tokenRefreshedAt:    new Date(),
        scopesGranted:       ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
      },
      create: {
        tenantId,
        platform:            'instagram',
        platformAccountId:   igAccountId,
        accountName:         igData.name     ?? igData.username ?? 'Instagram Account',
        accountHandle:       igData.username ? `@${igData.username}` : null,
        profilePictureUrl:   igData.profile_picture_url ?? null,
        status:              'connected',
        accessToken:         pageAccessToken,
        tokenExpiresAt:      expiresAt,
        tokenRefreshedAt:    new Date(),
        scopesGranted:       ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
      },
    });
  }

  // ── Facebook OAuth ───────────────────────────────────────────────────────

  getFacebookOAuthUrl(tenantId: string): string {
    const state = Buffer.from(JSON.stringify({ tenantId, platform: 'facebook' })).toString('base64url');
    const params = new URLSearchParams({
      client_id:     process.env.INSTAGRAM_CLIENT_ID!, // same Facebook App
      redirect_uri:  process.env.FACEBOOK_REDIRECT_URI!,
      scope:         'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata',
      response_type: 'code',
      state,
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  async handleFacebookCallback(code: string, stateRaw: string): Promise<void> {
    const { tenantId } = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) as { tenantId: string };

    const clientId     = process.env.INSTAGRAM_CLIENT_ID!;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET!;
    const redirectUri  = process.env.FACEBOOK_REDIRECT_URI!;

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
