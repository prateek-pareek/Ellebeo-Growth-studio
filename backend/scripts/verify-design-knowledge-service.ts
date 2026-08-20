import { DesignKnowledgeService } from '../src/ai/services/template-engine/design-knowledge.service';

const svc = new DesignKnowledgeService();

function check(label: string, condition: boolean) {
  console.log(`${condition ? '[OK]' : '[FAIL]'} ${label}`);
  if (!condition) process.exitCode = 1;
}

// 1. Exact ground truth lookup for a known rigid id
const exact = svc.getGroundTruth('layout_v2_editorial_z_pattern_1');
check('getGroundTruth exact hit returns real mined data', !!exact && exact.layoutFamily.value === 'editorial');
check('getGroundTruth exact hit has designRules', !!exact && exact.designRules.length > 0);

// 2. Miss case
const miss = svc.getGroundTruth('this_id_does_not_exist');
check('getGroundTruth miss returns null', miss === null);

// 3. Family stats for aliased families (macro id differs from layoutFamily.value)
const clinical = svc.getFamilyStats('clinical');
check('getFamilyStats(clinical) resolves via alias to clinical_hero samples', !!clinical && clinical.totalSamples === 11);

const minimalist = svc.getFamilyStats('minimalist');
check('getFamilyStats(minimalist) resolves via alias to minimalist_quote samples', !!minimalist && minimalist.totalSamples === 53);

const premium = svc.getFamilyStats('premium');
check('getFamilyStats(premium) resolves via alias to text_only samples', !!premium && premium.totalSamples === 35);

// 4. Family stats for identity-mapped families (thin data, per user's own flag)
const notif = svc.getFamilyStats('notification_card');
check('getFamilyStats(notification_card) finds the 1 real sample', !!notif && notif.totalSamples === 1);

const announcement = svc.getFamilyStats('announcement');
check('getFamilyStats(announcement) finds the 1 real sample', !!announcement && announcement.totalSamples === 1);

const transformation = svc.getFamilyStats('transformation');
check('getFamilyStats(transformation) finds all 13 real samples', !!transformation && transformation.totalSamples === 13);
check('getFamilyStats(transformation) sampleFraction is well-formed', !!transformation && /^\d+\/13$/.test(transformation.sampleFraction));

// 5. Unknown family
const unknown = svc.getFamilyStats('this_family_does_not_exist');
check('getFamilyStats unknown family returns null', unknown === null);

console.log('\nSample transformation stats:', JSON.stringify(transformation, null, 2));
