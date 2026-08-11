import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create User
  const passwordHash = await bcrypt.hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@ellebeo.com' },
    update: {},
    create: {
      email: 'admin@ellebeo.com',
      passwordHash,
      role: 'admin',
      emailVerified: true,
    },
  });

  // 2. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      businessName: 'Luminous Glow Beauty',
      displayName: 'Luminous Glow',
      subscriptionTier: 'premium',
      status: 'active',
      timezone: 'Australia/Sydney',
      locale: 'en-AU',
      onboardingCompleted: true,
    },
  });

  // 3. Create Brand DNA
  await prisma.brandDNA.upsert({
    where: { unique_current_brand_dna: { tenantId: tenant.id, isCurrent: true } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessName: 'Luminous Glow Beauty',
      oneLiner: 'Luxury boutique salon specializing in lived-in colour and extensions.',
      uniqueSellingProposition: 'Lived-in colour techniques that last 6+ months without touch-ups.',
      primaryPersona: 'Professional women in their 30s-40s who value low-maintenance luxury.',
      primaryTone: 'warm_professional',
      primaryBrandColor: '#D4AF37',
      secondaryBrandColor: '#000000',
      aestheticDirection: 'bold_luxury',
      serviceCategories: ['hair_color', 'extensions'],
      clientPainPoints: ['brassy tones', 'high-maintenance colour', 'thinning hair'],
      vocabularyPreferred: ['obsessed', 'flawless', 'lived-in', 'dimension'],
      vocabularyBlacklist: ['cheap', 'quick', 'deal', 'discount'],
      doNotSay: ['bargain', 'sale'],
      moodboardUrls: [],
      moodboardLabels: [],
      visualRanking: [],
      emojiPolicy: 'minimal',
    },
  });

  // 4. Create a Client
  let client = await prisma.client.findFirst({
    where: { tenantId: tenant.id, email: 'sarah.smith@example.com' },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Sarah',
        lastName: 'Smith',
        email: 'sarah.smith@example.com',
        phone: '+61400000000',
      },
    });
  }

  // 5. Create Consent Record (skip if one already exists for this client)
  const existingConsent = await prisma.consentRecord.findFirst({
    where: { tenantId: tenant.id, clientId: client.id },
  });
  if (!existingConsent) {
    await prisma.consentRecord.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        status: 'granted',
        allowShowFace: true,
        allowUseName: true,
        allowTagSocial: false,
        allowPlatformPromotion: true,
        allowInternalUse: true,
        allowMarketingContent: true,
        consentMethod: 'digital_form',
      },
    });
  }

  console.log('Seeding completed successfully!');
  console.log('Login: admin@ellebeo.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
