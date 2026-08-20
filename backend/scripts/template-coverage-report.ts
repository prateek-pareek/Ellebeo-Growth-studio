import * as fs from 'fs';
import * as path from 'path';
import { PrimitiveEngine } from '../src/ai/services/template-engine/engines/primitive-engine';

const compiledLayoutsPath = path.join(__dirname, '../src/ai/config/compiled-layouts.v1.json');

function runCoverageReport() {
  console.log('\n======================================================');
  console.log('       TEMPLATE SIGNATURE COVERAGE REPORT');
  console.log('======================================================\n');

  if (!fs.existsSync(compiledLayoutsPath)) {
    console.error(`File not found: ${compiledLayoutsPath}`);
    process.exit(1);
  }

  const layouts = JSON.parse(fs.readFileSync(compiledLayoutsPath, 'utf8'));
  const engine = new PrimitiveEngine();
  const availablePrimitives = Object.keys(engine.registry);

  let totalWithContracts = 0;
  let totalFullyCovered = 0;

  for (const [id, layout] of Object.entries(layouts)) {
    // Exclude metadata/schema keys
    if (id === 'schemaVersion' || id === 'layoutVersion') continue;

    const contract = (layout as any).contract;
    if (!contract || !contract.required) continue;

    totalWithContracts++;
    
    let isFullyCovered = true;
    const missing: string[] = [];

    for (const req of contract.required) {
      if (!availablePrimitives.includes(req)) {
        isFullyCovered = false;
        missing.push(req);
      }
    }

    if (isFullyCovered) {
      totalFullyCovered++;
      console.log(`✅ ${id}`);
    } else {
      console.log(`❌ ${id}`);
      console.log(`   Missing: ${missing.join(', ')}`);
    }
  }

  console.log('\n------------------------------------------------------');
  if (totalWithContracts === 0) {
    console.log('No Signature Contracts found in compiled-layouts.v1.json');
  } else {
    const percentage = Math.round((totalFullyCovered / totalWithContracts) * 100);
    console.log(`TOTAL TEMPLATES WITH CONTRACTS: ${totalWithContracts}`);
    console.log(`FULLY COVERED: ${totalFullyCovered}`);
    console.log(`COVERAGE SCORE: ${percentage}%`);
  }
  console.log('------------------------------------------------------\n');
}

runCoverageReport();
