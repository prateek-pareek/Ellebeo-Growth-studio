import { AiImageGenerationService } from '../src/ai/services/ai-image-generation.service';
import { COMPILED_LAYOUTS } from '../src/ai/config/layout-renderers';
import * as fs from 'fs';
import * as path from 'path';

process.env.LOCAL_TEST = 'true';

// Find layout templates/families related to 'editorial'
const editorialLayoutIds = Object.keys(COMPILED_LAYOUTS).filter(id => id.includes('editorial'));
console.log(`Found ${editorialLayoutIds.length} compiled layouts matching 'editorial'.`);

// We'll pick 4 representative slides from the editorial family
const selectedLayouts = editorialLayoutIds.length >= 4 
  ? [editorialLayoutIds[0], editorialLayoutIds[1], editorialLayoutIds[2], editorialLayoutIds[3]]
  : ['layout_v2_editorial_z_pattern_1', 'layout_v2_editorial_center_down_7', 'layout_v2_editorial_diagonal_97', 'layout_v2_editorial_z_pattern_182'];

const TEST_PHOTO_URL = 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?ixlib=rb-4.0.3&auto=format&fit=crop&w=1024&q=80';

async function run() {
  console.log('=== Visual Validation: Editorial Magazine Design Family Carousel ===\n');

  const service = new AiImageGenerationService();
  const outputDir = path.join(__dirname, '../.tempmediaStorage/editorial_validation');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const concepts = [
    { headline: 'THE FUTURE OF BEAUTY', subheadline: 'Minimalist aesthetic & precision care for skin health', cta: 'EXPLORE COLLECTION', index: 1 },
    { headline: 'RADIANT SKIN SCIENCE', subheadline: 'Formulated with active botanical extracts & vitamins', cta: 'DISCOVER FORMULA', index: 2 },
    { headline: 'ARCHITECTURAL BALANCE', subheadline: 'Pure symmetry designed for daily restorative rituals', cta: 'VIEW ROUTINE', index: 3 },
    { headline: 'ELEVATE YOUR GLOW', subheadline: 'Experience timeless luxury in every application', cta: 'BOOK SESSION', index: 4 },
  ];

  const generatedSlides = [];

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    const layoutId = selectedLayouts[i];
    const overlayText = `${concept.headline}\n${concept.subheadline}`;

    console.log(`[Slide ${i + 1}/4] Rendering Editorial Layout: ${layoutId}`);
    console.log(`  Headline: "${concept.headline}"`);

    try {
      const result = await service.generateSlide({
        photoUrl: TEST_PHOTO_URL,
        overlayText,
        headline: concept.headline,
        subheadline: concept.subheadline,
        cta: concept.cta,
        title: `Slide ${i + 1}`,
        index: i + 1,
        isFirst: i === 0,
        isLast: i === concepts.length - 1,
        isBeforePhoto: false,
        outputSize: '1024x1024',
        tenantId: 'editorial-validation-test',
        businessName: 'Lumina Aesthetics',
        brandColor: '#E6D5C3',
        secondaryColor: '#2B2B2B',
        backgroundBrandColor: '#F7F4EF',
        accentBrandColor: '#D4A373',
        depthBrandColor: '#1E1E1C',
        brandFont: 'Playfair Display',
        bodyFont: 'Inter',
        layoutType: layoutId,
        totalSlides: 4,
        visualRanking: ['editorial_beauty', 'quiet_luxury'],
        capitalizationRule: 'uppercase',
        footerBrandToggle: true,
        generatorModel: 'none',
        templateIntent: 'educational',
      });

      console.log(`  ✅ Generated -> ${result.url}`);
      generatedSlides.push({ index: i + 1, layoutId, url: result.url });
    } catch (err: any) {
      console.error(`  ❌ Error on slide ${i + 1}: ${err.message}`);
    }
  }

  console.log('\n=== EDITORIAL MAGAZINE CAROUSEL GENERATED ===');
  console.log(JSON.stringify(generatedSlides, null, 2));
}

run().catch(console.error);
