import { Injectable } from '@nestjs/common';
import {
  videoCallbackQueue,
  videoDirectorQueue,
  videoPublishQueue,
  videoRenderQueue,
} from '../queues/queue.definitions';
import type { VideoCallbackPayload } from './core/video-callback.processor';

@Injectable()
export class VideoQueueService {
  enqueueRender(videoJobId: string, tenantId: string) {
    return videoRenderQueue.add(
      'render',
      { videoJobId, tenantId },
      { jobId: `video-render:${videoJobId}` },
    );
  }

  enqueueCallback(payload: VideoCallbackPayload) {
    return videoCallbackQueue.add(
      'callback',
      payload,
      { jobId: `video-callback:${payload.renderId}:${payload.status}` },
    );
  }

  enqueuePublish(videoJobId: string, tenantId: string, scheduledPostId: string) {
    return videoPublishQueue.add(
      'publish',
      { videoJobId, tenantId, scheduledPostId },
      { jobId: `video-publish:${videoJobId}:${scheduledPostId}` },
    );
  }

  enqueueDirector(videoJobId: string, tenantId: string) {
    return videoDirectorQueue.add(
      'direct',
      { videoJobId, tenantId },
      { jobId: `video-director:${videoJobId}` },
    );
  }
}
