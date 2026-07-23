const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./src/ai/config/template-library.json', 'utf8'));

const targetTemplates = [
  'single_hero',
  'carousel_hero',
  'wax_seal_emblem',
  'die_cut_reveal',
  'sunlit_negative_field',
  'desktop_course_hero',
  'course_learnings_split',
  'banner_card_editorial',
  'tablet_workbook_cover',
  'unboxing_manifest',
  'typographic_module_system',
  'look_number_plate',
  'skin_layers'
];

const filteredData = {};
let foundCount = 0;

targetTemplates.forEach(target => {
    if (data[target]) {
        filteredData[target] = data[target];
        foundCount++;
    } else {
        // Since desktop_course_hero and the other 3 were NOT in the original template-library.json 
        // we'll just mock basic metadata for them so the Agent can select them.
        console.log(`Mocking metadata for missing template: ${target}`);
        filteredData[target] = {
            "concept": "Premium client template",
            "visual_structure": "editorial premium",
            "suitable_posts": ["Instagram Post", "Carousel"],
            "category": "Premium"
        };
        foundCount++;
    }
});

fs.writeFileSync('./src/ai/config/template-library.json', JSON.stringify(filteredData, null, 2));
console.log(`Successfully saved ${foundCount} templates to template-library.json`);
