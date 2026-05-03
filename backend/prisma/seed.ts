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
      brandColourPrimary: '#D4AF37',
      brandColourSecondary: '#000000',
      aestheticDirection: 'bold_luxury',
      vocabularyPreferred: ['obsessed', 'flawless', 'lived-in', 'dimension'],
      vocabularyBlacklist: ['cheap', 'quick', 'deal', 'discount'],
      emojiPolicy: 'minimal',
    },
  });

  // 4. Create a Client
  const client = await prisma.client.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' }, // Dummy UUID just to have a fixed point if needed, or findFirst
    update: {},
    create: {
      tenantId: tenant.id,
      firstName: 'Sarah',
      lastName: 'Smith',
      email: 'sarah.smith@example.com',
      phone: '+61400000000',
    },
  });

  // 5. Create Consent Record
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

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
