import { filterClientPhotos } from './client-photo-gate';

describe('filterClientPhotos', () => {
  it('removes flagged client photos when medicalAesthetics is true', () => {
    const result = filterClientPhotos(
      ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      [true, false],
      true,
    );
    expect(result).toEqual([undefined, 'https://cdn.example.com/2.jpg']);
  });

  it('leaves all images untouched when medicalAesthetics is false, even if flagged', () => {
    const result = filterClientPhotos(
      ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      [true, true],
      false,
    );
    expect(result).toEqual(['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg']);
  });

  it('leaves images untouched when no flags are supplied at all', () => {
    const result = filterClientPhotos(['https://cdn.example.com/1.jpg'], undefined, true);
    expect(result).toEqual(['https://cdn.example.com/1.jpg']);
  });

  it('is video-type-agnostic — works the same on any list of urls regardless of which AssetProvider calls it', () => {
    // Simulates a Phase 7 ai_clips provider's technician-supplied reference images.
    const aiClipsReferenceImages = ['https://cdn.example.com/client-face.jpg', 'https://cdn.example.com/brand-logo.jpg'];
    const result = filterClientPhotos(aiClipsReferenceImages, [true, false], true);
    expect(result).toEqual([undefined, 'https://cdn.example.com/brand-logo.jpg']);
  });
});
