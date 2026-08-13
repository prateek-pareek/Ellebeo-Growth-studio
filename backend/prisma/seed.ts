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
  // hasGrowthStudioAccess is a dedicated boolean column (default: false) that gates the
  // "ACCESS REQUIRED / Unlock Growth Studio" paywall in the frontend — it is NOT derived from
  // subscriptionTier or status. Real signups get it set explicitly in auth.service.ts; the seed
  // tenant needs the same, on both create and update, so re-running `db:seed` against an
  // already-seeded database also fixes it (upsert's `update` was previously a no-op `{}`).
  const tenant = await prisma.tenant.upsert({
    where: { userId: user.id },
    update: { hasGrowthStudioAccess: true },
    create: {
      userId: user.id,
      businessName: 'Luminous Glow Beauty',
      displayName: 'Luminous Glow',
      subscriptionTier: 'premium',
      status: 'active',
      hasGrowthStudioAccess: true,
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

  // 6. Create an Appointment with before/after photos so the Generate flow has something to
  // work with (GeneratePage shows "No appointments yet" until at least one row exists for the
  // tenant; consent resolves via the client-level ConsentRecord from step 5, so no direct
  // consentRecordId link is needed here). Photos are freely-licensed Unsplash stock portraits —
  // placeholders only, so the AI image pipeline (face detection, subject-avoidance layout) has a
  // real photo to run against locally.
  let appointment = await prisma.appointment.findFirst({
    where: { tenantId: tenant.id, clientId: client.id, serviceName: 'Balayage Color Correction' },
  });
  if (!appointment) {
    appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        serviceCategory: 'hair_colour',
        serviceName: 'Balayage Color Correction',
        serviceDescription: 'Corrected brassy box-dye colour into a lived-in, dimensional blonde balayage.',
        appointmentDate: new Date('2026-08-10T10:30:00+10:00'),
        durationMinutes: 180,
        source: 'manual',
        notes: 'Client wanted low-maintenance regrowth and softer, warmer tone.',
      },
    });

    await prisma.imageAsset.createMany({
      data: [
        {
          tenantId: tenant.id,
          appointmentId: appointment.id,
          rawUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=1200&q=80',
          assetType: 'image',
          isBeforePhoto: true,
          source: 'manual',
          uploadValidated: true,
        },
        {
          tenantId: tenant.id,
          appointmentId: appointment.id,
          rawUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1200&q=80',
          assetType: 'image',
          isAfterPhoto: true,
          source: 'manual',
          uploadValidated: true,
        },
      ],
    });
  }

  console.log('Seeding completed successfully!');
  console.log('Login: admin@ellebeo.com / password123');
  console.log(`Appointment ready: ${appointment.serviceName} for ${client.firstName} ${client.lastName} (${appointment.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
