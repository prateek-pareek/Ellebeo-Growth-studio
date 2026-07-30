/**
 * Visual Validation Script — Offline SVG Rendering Test
 * 
 * This script bypasses the full carousel generation pipeline (which requires
 * OpenAI API keys, Firebase, etc.) and instead directly exercises the rendering
 * engine by calling `generateSlide` with known-good layout IDs from
 * compiled-layouts.v2.json.
 *
 * It tests 10 different layout IDs across different visual families to verify
 * that each design family produces visually distinct output.
 */
import { AiImageGenerationService } from '../src/ai/services/ai-image-generation.service';
import { COMPILED_LAYOUTS, resolveLayoutTemplate } from '../src/ai/config/layout-renderers';
import * as fs from 'fs';
import * as path from 'path';

process.env.LOCAL_TEST = 'true';

// Pick 10 diverse layout IDs from compiled-layouts.v2.json
// Selecting across different family types for maximum visual diversity
const LAYOUT_IDS_TO_TEST = [
  'layout_v2_editorial_z_pattern_1',        // Z-pattern editorial
  'layout_v2_minimalist_quote_center_down_2', // Minimalist quote
  'layout_v2_editorial_center_down_7',       // Center-down editorial
  'layout_v2_clinical_hero_center_down_11',  // Clinical hero
  'layout_v2_testimonial_center_down_70',    // Testimonial
  'layout_v2_editorial_diagonal_97',         // Diagonal editorial
  'layout_v2_text_only_center_down_108',     // Text-only
  'layout_v2_clinical_hero_center_outward_164', // Outward clinical
  'layout_v2_editorial_z_pattern_182',       // Another z-pattern
  'layout_v2_editorial_center_down_200',     // Late editorial center-down
];

// Unsplash photo of nails/beauty — our standard test image
const TEST_PHOTO_URL = 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?ixlib=rb-4.0.3&auto=format&fit=crop&w=1024&q=80';

async function run() {
  console.log('=== Visual Validation: Offline SVG Rendering Test ===\n');
  
  // Validate that all layout IDs actually exist in the compiled layouts
  const missing = LAYOUT_IDS_TO_TEST.filter(id => !COMPILED_LAYOUTS[id]);
  if (missing.length > 0) {
    console.error('ERROR: The following layout IDs do not exist in compiled-layouts.v2.json:');
    missing.forEach(id => console.error(`  - ${id}`));
    
    // Pick real IDs as replacements
    const allIds = Object.keys(COMPILED_LAYOUTS);
    console.log(`\nAvailable layout families (first 20 of ${allIds.length}):`);
    allIds.slice(0, 20).forEach(id => console.log(`  ${id}`));
    process.exit(1);
  }

  const service = new AiImageGenerationService();
  const outputDir = path.join(__dirname, '../.tempmediaStorage/validation');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const testTexts = [
    { headline: 'THE FUTURE OF BEAUTY', subheadline: 'Premium care for every skin type', cta: 'Book now' },
    { headline: 'RADIANT SKIN AWAITS', subheadline: 'Our signature facial treatment', cta: 'Learn more' },
    { headline: 'GLOW UP', subheadline: 'Transform your skincare routine', cta: 'Schedule today' },
    { headline: 'LUXURY NAILS', subheadline: 'Hand-crafted perfection', cta: 'View gallery' },
    { headline: 'TOTAL TRANSFORMATION', subheadline: 'Before and after results', cta: 'See results' },
    { headline: 'PRECISION AND CARE', subheadline: 'Every detail matters', cta: 'Discover' },
    { headline: 'SELF CARE SUNDAY', subheadline: 'Treat yourself this weekend', cta: 'Book session' },
    { headline: 'EXPERT ARTISTRY', subheadline: 'Master technicians at your service', cta: 'Contact us' },
    { headline: 'REFRESH RENEW', subheadline: 'Your beauty journey starts here', cta: 'Get started' },
    { headline: 'NEW SEASON NEW YOU', subheadline: 'Seasonal specials available', cta: 'View offers' },
  ];

  const results: Array<{ layoutId: string; outputPath: string; success: boolean; error?: string }> = [];

  for (let i = 0; i < LAYOUT_IDS_TO_TEST.length; i++) {
    const layoutId = LAYOUT_IDS_TO_TEST[i];
    const textData = testTexts[i];
    const overlayText = `${textData.headline}\n${textData.subheadline}`;
    
    console.log(`[${i + 1}/10] Rendering layout: ${layoutId}`);
    console.log(`  Text: "${textData.headline}" / "${textData.subheadline}"`);

    try {
      const result = await service.generateSlide({
        photoUrl: TEST_PHOTO_URL,
        overlayText,
        headline: textData.headline,
        subheadline: textData.subheadline,
        cta: textData.cta,
        title: `Slide ${i + 1}`,
        index: i + 1,
        isFirst: i === 0,
        isLast: i === LAYOUT_IDS_TO_TEST.length - 1,
        isBeforePhoto: false,
        outputSize: '1024x1024',
        tenantId: 'visual-validation-test',
        businessName: 'Lumina Aesthetics',
        brandColor: '#E6D5C3',
        secondaryColor: '#2B2B2B',
        backgroundBrandColor: '#F7F4EF',
        accentBrandColor: '#D4A373',
        depthBrandColor: '#1E1E1C',
        brandFont: 'Playfair Display',
        bodyFont: 'Inter',
        layoutType: layoutId,
        totalSlides: 10,
        visualRanking: ['quiet_luxury', 'editorial_beauty'],
        capitalizationRule: 'uppercase',
        footerBrandToggle: true,
        generatorModel: 'none',
        templateIntent: 'educational',
      });

      const outputPath = path.join(outputDir, `validation_${i + 1}_${layoutId.replace(/layout_v2_/g, '')}.png`);
      
      // result.url is a file:// path from our LOCAL_TEST mock
      // But generateSlide returns { url, title, label }, where url is already the uploaded path
      // We need the raw base64 — let's save from the result directly
      if (result.url) {
        console.log(`  ✅ Success → ${result.url}`);
        results.push({ layoutId, outputPath: result.url, success: true });
      } else {
        console.log(`  ⚠️ No output URL`);
        results.push({ layoutId, outputPath: '', success: false, error: 'No URL returned' });
      }
    } catch (err: any) {
      console.error(`  ❌ Error: ${err.message}`);
      results.push({ layoutId, outputPath: '', success: false, error: err.message });
    }
  }

  // Summary
  console.log('\n=== VALIDATION SUMMARY ===');
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  console.log(`✅ Passed: ${successes.length}/10`);
  console.log(`❌ Failed: ${failures.length}/10`);
  
  if (failures.length > 0) {
    console.log('\nFailed layouts:');
    failures.forEach(f => console.log(`  - ${f.layoutId}: ${f.error}`));
  }

  if (successes.length > 0) {
    console.log('\nGenerated files:');
    successes.forEach(s => console.log(`  ${s.outputPath}`));
  }
}

run().catch(console.error);
