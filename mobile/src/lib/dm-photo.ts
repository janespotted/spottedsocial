import type { PendingDm } from './dm-outbox';
import { prepareForUpload } from './media-prep';
import { uploadMedia } from './publish-post';
import { assertSessionRevision, getSessionRevision, getSessionUserId } from './session-identity';

export async function uploadPendingDmPhoto(message: PendingDm): Promise<PendingDm> {
  if (!message.localAsset || message.image_url) return message;
  const revision = getSessionRevision();
  if (getSessionUserId() !== message.sender_id) throw new Error('Account changed');
  const media = await prepareForUpload({ uri: message.localAsset, type: 'image',
    mimeType: message.localMimeType ?? 'image/jpeg', fileExt: message.localMimeType === 'image/png' ? 'png' : 'jpg' });
  assertSessionRevision(revision);
  const path = `${message.sender_id}/private-v1/dm/${message.thread_id}/${message.id}-${Date.now()}.${media.fileExt}`;
  await uploadMedia(path, media);
  assertSessionRevision(revision);
  return { ...message, image_url: path };
}
