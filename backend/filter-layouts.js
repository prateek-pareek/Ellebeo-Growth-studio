const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./src/ai/config/template-library.json', 'utf8'));

const targetTemplates = [
  'single_hero',
  'carousel_hero',
  'wax_seal_emblem',
  'die_cut_reveal',
  'sunlit_negative_field', // note the user said "sun lit", but from keys it might be "sunlit_negative_field"? Let's search keys.
  'desktop_course_hero',
  'course_learnings_split',
  'banner_card_editorial',
  'tablet_workbook_cover',
  'unboxing_manifest',
  'typographic_module_system',
  'look_number_plate',
  'skin_layers'
];

// Let's do a fuzzy search if exact doesn't match
const filteredData = {};
const allKeys = Object.keys(data);
let foundCount = 0;

targetTemplates.forEach(target => {
    let exact = target;
    if (!data[exact]) {
        // try to find by substring
        const matches = allKeys.filter(k => k.replace(/_/g, ' ').includes(target) || k.includes(target) || k === target.replace(/ /g, '_'));
        if (matches.length > 0) {
            exact = matches[0];
            console.log(`Fuzzy matched '${target}' to '${exact}'`);
        }
    }
    
    if (data[exact]) {
        filteredData[exact] = data[exact];
        foundCount++;
    } else {
        console.log(`MISSING: ${target}`);
    }
});

fs.writeFileSync('./src/ai/config/compiled-layouts.v1.json', JSON.stringify(filteredData, null, 2));
console.log(`Saved ${foundCount} templates.`);
