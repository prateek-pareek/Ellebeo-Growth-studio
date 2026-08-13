import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { firebaseStorage } from '../../../config/firebase.client';
import type { VideoOutputStore } from './video-callback.processor';

export class FirebaseVideoOutputStore implements VideoOutputStore {
  async storeRenderedVideo(sourceUrl: string, tenantId: string, videoJobId: string): Promise<string> {
    if (!firebaseStorage) return sourceUrl;

    const response = await fetch(sourceUrl);
    if (!response.ok) return sourceUrl;

    const buffer = Buffer.from(await response.arrayBuffer());
    const storagePath = `videos/${tenantId}/${videoJobId}/${randomUUID()}.mp4`;
    const bucket = firebaseStorage.bucket();
    await bucket.file(storagePath).save(buffer, {
      metadata: { contentType: 'video/mp4' },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;
  }
}
