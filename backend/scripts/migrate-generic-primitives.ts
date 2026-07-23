import * as fs from 'fs';
import * as path from 'path';

const LAYOUTS_PATH = path.join(__dirname, '../src/ai/config/compiled-layouts.v1.json');

interface IDSLDecorationLayer {
  id: string;
  zIndex: number;
  type: 'decoration';
  component: string;
  anchor: string;
  offsetPercent: number;
}

function run() {
  console.log('Loading compiled layouts...');
  const data = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf-8'));
  const layoutKeys = Object.keys(data);
  let updatedCount = 0;

  for (const key of layoutKeys) {
    const layout = data[key];
    
    // Skip if it doesn't have layers array (invalid format)
    if (!layout.layers || !Array.isArray(layout.layers)) continue;

    const hasDecoration = layout.layers.some((l: any) => l.type === 'decoration');
    
    // If it doesn't already have a generic decoration, maybe inject one
    if (!hasDecoration && Math.random() > 0.5) {
      const candidates = ['floating_frame', 'paper_attachment', 'editorial_badge'];
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      
      const newLayer: IDSLDecorationLayer = {
        id: `generic-${chosen}-${Date.now()}`,
        zIndex: 5,
        type: 'decoration',
        component: chosen,
        anchor: 'top_left',
        offsetPercent: 5
      };

      // Randomize anchor to add variety
      const anchors = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];
      newLayer.anchor = anchors[Math.floor(Math.random() * anchors.length)];

      layout.layers.push(newLayer);
      updatedCount++;
    }
  }

  console.log(`Writing changes... injected generic vocabulary into ${updatedCount} layouts.`);
  fs.writeFileSync(LAYOUTS_PATH, JSON.stringify(data, null, 2));
  console.log('Done!');
}

run();
