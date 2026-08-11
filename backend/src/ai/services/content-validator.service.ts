import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ContentValidatorService {
  private readonly logger = new Logger(ContentValidatorService.name);

  /**
   * Validates and trims generated copy to fit premium design layouts.
   * Modifies the array in place or returns a cleaned copy.
   */
  public validateStoryFrames(frames: Array<{ index: number; title: string; overlayText: string; headline?: string; subheadline?: string; cta?: string; }>) {
    this.logger.log(`Validating ${frames.length} frames for content quality...`);
    
    const memory = new Set<string>();

    return frames.map(frame => {
      // 1. Trimming Length Constraints
      let headline = frame.headline || '';
      let subheadline = frame.subheadline || '';
      let overlayText = frame.overlayText || '';

      // Headline max ~40 chars
      if (headline.length > 45) {
        headline = this.smartTrim(headline, 40);
      }
      
      // Subheadline max ~80 chars
      if (subheadline.length > 85) {
        subheadline = this.smartTrim(subheadline, 80);
      }

      // 2. Deduplication (Repetition check)
      // Check if subheadline is exactly the headline
      if (subheadline && headline && subheadline.toLowerCase() === headline.toLowerCase()) {
        subheadline = '';
      }
      
      // If we've seen this exact headline before, try to demote it to subheadline or clear it
      const headKey = headline.toLowerCase().trim();
      if (headKey && memory.has(headKey)) {
        headline = ''; 
        // If headline is cleared, move subheadline up if it fits
        if (subheadline.length < 45) {
          headline = subheadline;
          subheadline = '';
        }
      }
      if (headKey) memory.add(headKey);

      // If we've seen this exact subheadline before, clear it
      const subKey = subheadline.toLowerCase().trim();
      if (subKey && memory.has(subKey)) {
        subheadline = '';
      }
      if (subKey) memory.add(subKey);

      return {
        ...frame,
        headline,
        subheadline,
        overlayText: headline || overlayText // Keep overlay text in sync
      };
    });
  }

  private smartTrim(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    
    // Try to cut at the last punctuation mark before maxLength
    const snippet = text.slice(0, maxLength);
    const lastPunctuation = Math.max(snippet.lastIndexOf('.'), snippet.lastIndexOf('!'), snippet.lastIndexOf('?'));
    
    if (lastPunctuation > maxLength * 0.5) {
      return snippet.slice(0, lastPunctuation + 1);
    }
    
    // Otherwise cut at the last space
    const lastSpace = snippet.lastIndexOf(' ');
    if (lastSpace > 0) {
      return snippet.slice(0, lastSpace) + '...';
    }
    
    return snippet + '...';
  }
}
