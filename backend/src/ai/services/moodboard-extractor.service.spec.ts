import { Test, TestingModule } from '@nestjs/testing';
import { MoodboardExtractorService } from './moodboard-extractor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () => JSON.stringify({
                primaryColor: '#2C3A2E',
                secondaryColor: '#C28D75',
                backgroundColor: '#F7F4EF',
                accentColor: '#D4A373',
                depthColor: '#1E1E1C',
                lightingStyle: 'soft diffused daylight',
                texturePreference: 'matte linen',
                compositionStyle: 'negative space',
                styleVibe: 'quiet_luxury',
              }),
            },
          }),
        }),
      };
    }),
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
    },
  };
});

describe('MoodboardExtractorService', () => {
  let service: MoodboardExtractorService;
  let prisma: PrismaService;

  const mockPrisma = {
    brandDNA: {
      findFirst: jest.fn().mockResolvedValue({ id: 'dna-123', tenantId: 'tenant-123' }),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ ...args.data, id: 'dna-123' })),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodboardExtractorService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MoodboardExtractorService>(MoodboardExtractorService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract moodboard visual parameters and update BrandDNA', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    
    // Stub global fetch / buffer download to avoid network requests during test
    const spyDownload = jest.spyOn(require('./moodboard-extractor.service'), 'downloadImageAsBuffer' as any);
    spyDownload.mockResolvedValue(Buffer.from('fake-image-bytes'));

    const result = await service.analyseMoodboards('tenant-123', ['https://example.com/image.jpg']);

    expect(result).toBeDefined();
    expect(result.primaryBrandColor).toBe('#2C3A2E');
    expect(result.lightingPreference).toContain('soft diffused daylight');
    expect(result.visualRanking).toContain('quiet_luxury');
    expect(prisma.brandDNA.update).toHaveBeenCalled();
  });
});
