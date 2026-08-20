import { dataUrlToPng, storageAvailable } from './post-library';

/**
 * Keeping a post is the step that turns the Lab from a generator into a
 * library. The client hands back exactly the image it was shown, so the
 * decoding has to be strict about what it accepts — a silently truncated or
 * mistyped payload would be stored as the studio's own work.
 */
describe('post library', () => {
  const onePixelPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('decodes an image the client hands back', () => {
    const buf = dataUrlToPng(onePixelPng)!;
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic number — proof it decoded rather than returning noise.
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it('refuses anything that is not an image data URL', () => {
    expect(dataUrlToPng('https://example.com/a.png')).toBeNull();
    expect(dataUrlToPng('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(dataUrlToPng('')).toBeNull();
    expect(dataUrlToPng('data:image/png;base64,')).toBeNull();
  });

  it('handles a data URL with no base64 marker rather than throwing', () => {
    expect(dataUrlToPng('data:image/png')).toBeNull();
  });

  it('reports whether storage is configured, without throwing when it is not', () => {
    // A deployment with no Cloudinary credentials must still boot and
    // generate — only keeping a post is unavailable.
    expect(typeof storageAvailable()).toBe('boolean');
  });
});
