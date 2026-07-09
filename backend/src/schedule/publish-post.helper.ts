// ============================================================================
// publish-post.helper.ts — shared publish logic used by both the manual
// "Publish now" endpoint (ScheduleService) and the BullMQ delayed worker.
// ============================================================================

import { PrismaClient } from '@prisma/client';

export async function publishScheduledPost(
  prisma: PrismaClient | any,
  scheduledPostId: string,
): Promise<void> {
  const post = await prisma.scheduledPost.findUnique({
    where: { id: scheduledPostId },
    include: {
      contentItem: {
        select: {
          caption: true,
          processedImageUrlFeed: true,
          reelThumbnailUrl: true,
          finalVideoUrl: true,
          platformVariants: true,
        },
      },
    },
  });

  if (!post) throw new Error(`ScheduledPost ${scheduledPostId} not found`);

  // Already published or cancelled — nothing to do.
  if (!['pending', 'failed'].includes(post.publishStatus)) return;

  const account = await prisma.socialAccount.findUnique({ where: { id: post.socialAccountId } });
  if (!account || account.status !== 'connected' || !account.accessToken) {
    throw new Error('Social account not connected — reconnect the account and try again');
  }

  const caption = post.captionOverride ?? post.contentItem?.caption ?? '';
  const imageUrl = post.contentItem?.processedImageUrlFeed ?? null;
  const videoUrl = post.contentItem?.finalVideoUrl ?? null;
  const platformVariants = post.contentItem?.platformVariants as any;
  const carouselUrls =
    platformVariants?.type === 'carousel'
      ? (platformVariants.slides as { url: string }[]).map((s: { url: string }) => s.url)
      : null;

  if (account.platform === 'instagram') {
    await publishToInstagram(
      account.platformAccountId!,
      account.accessToken,
      imageUrl,
      videoUrl,
      carouselUrls,
      caption,
      post.postFormat,
    );
  } else if (account.platform === 'facebook') {
    await publishToFacebook(account.platformAccountId!, account.accessToken, imageUrl, caption);
  } else {
    throw new Error(`Publishing not supported for platform: ${account.platform}`);
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { publishStatus: 'published', publishedAt: new Date() },
  });
}

// ── Instagram ─────────────────────────────────────────────────────────────────

async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  imageUrl: string | null,
  videoUrl: string | null,
  carouselUrls: string[] | null,
  caption: string,
  format: string,
): Promise<void> {
  const isReel     = format === 'reel';
  const isStory    = format === 'story';
  const isCarousel = format === 'carousel' && carouselUrls && carouselUrls.length > 1;

  if (isCarousel) {
    const childIds: string[] = [];
    for (const url of carouselUrls!) {
      const res  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: accessToken }),
      });
      const data = await res.json() as any;
      if (!data.id) throw new Error(data.error?.message ?? 'Failed to create carousel item');
      childIds.push(data.id);
    }
    const parentRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'CAROUSEL', caption, children: childIds.join(','), access_token: accessToken }),
    });
    const parentData = await parentRes.json() as any;
    if (!parentData.id) throw new Error(parentData.error?.message ?? 'Failed to create carousel container');
    const publishRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: parentData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json() as any;
    if (!publishData.id) throw new Error(publishData.error?.message ?? 'Failed to publish carousel');
    return;
  }

  const mediaUrl = isReel ? videoUrl : imageUrl;
  if (!mediaUrl) throw new Error('No media URL available for publishing');

  const containerParams: Record<string, string> = { access_token: accessToken };
  if (!isStory) containerParams.caption = caption;
  if (isReel) {
    containerParams.media_type = 'REELS';
    containerParams.video_url  = mediaUrl;
  } else if (isStory) {
    containerParams.media_type = 'STORIES';
    containerParams.image_url  = mediaUrl;
  } else {
    containerParams.image_url  = mediaUrl;
  }

  const containerRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerParams),
  });
  const containerData = await containerRes.json() as any;
  if (!containerData.id) throw new Error(containerData.error?.message ?? 'Failed to create media container');

  if (isReel) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes  = await fetch(
        `https://graph.instagram.com/v21.0/${containerData.id}?fields=status_code&access_token=${accessToken}`,
      );
      const statusData = await statusRes.json() as any;
      if (statusData.status_code === 'FINISHED') break;
      if (statusData.status_code === 'ERROR') throw new Error('Reel processing failed on Instagram');
    }
  }

  const publishRes  = await fetch(`https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
  });
  const publishData = await publishRes.json() as any;
  if (!publishData.id) throw new Error(publishData.error?.message ?? 'Failed to publish to Instagram');
}

// ── Facebook ──────────────────────────────────────────────────────────────────

async function publishToFacebook(
  pageId: string,
  pageToken: string,
  imageUrl: string | null,
  caption: string,
): Promise<void> {
  if (!imageUrl) throw new Error('No image URL available for publishing');
  const res  = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption, access_token: pageToken }),
  });
  const data = await res.json() as any;
  if (!data.id) throw new Error(data.error?.message ?? 'Failed to publish to Facebook');
}
