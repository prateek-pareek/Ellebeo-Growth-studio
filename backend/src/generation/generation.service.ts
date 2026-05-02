import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateContentDto, TweakContentDto } from './dto/generation.dto';
import { GenerationGateway } from './generation.gateway';
import { contentGenerationQueue } from '../ai/queues/queue.definitions';

@Injectable()
export class GenerationService {
  constructor(private prisma: PrismaService, private generationGateway: GenerationGateway) {}

  async generate(tenantId: string, clientId: string, dto: GenerateContentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { client: true, consentRecord: true }
    });

    if (!appointment || appointment.tenantId !== tenantId) {
      throw new NotFoundException('Appointment not found');
    }

    if (!appointment.consentRecord || appointment.consentRecord.status !== 'granted') {
      throw new BadRequestException('Valid consent record is required for generation');
    }

    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
    });

    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before generation');
    }

    // Input Sanitisation would happen here before saving the job payload

    // Create the generation job
    const job = await this.prisma.generationJob.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        jobPayload: dto as any,
        consentSnapshot: appointment.consentRecord as any,
        brandDnaSnapshot: brandDna as any,
        brandDnaVersion: brandDna.version,
        outputFormats: dto.outputFormats,
        platforms: dto.platforms,
        includeVoiceover: dto.includeVoiceover,
        includeMusic: dto.includeMusic,
        state: 'created',
      }
    });

    await contentGenerationQueue.add(
      `generation:${job.id}`,
      {
        jobId: job.id,
        tenantId,
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        consentSnapshot: appointment.consentRecord,
        brandDNA: brandDna,
        businessGoal: 'build_brand_authority',
        imageAssets: [],
        generationOptions: {
          outputFormats: dto.outputFormats,
          includeVoiceover: dto.includeVoiceover,
          includeMusic: dto.includeMusic,
          platform: dto.platforms,
          userTier: 'standard',
        },
        goldenExamples: [],
        createdAt: new Date().toISOString(),
        priority: 5,
      },
      { jobId: job.id },
    );

    // Assuming a simple calculation for estimated seconds based on formats
    const estimatedSeconds = dto.outputFormats.includes('reel' as any) ? 120 : 30;

    this.generationGateway.emitJobUpdate(job.id, job.state);

    return {
      jobId: job.id,
      estimatedSeconds,
      rateLimitRemaining: {
        generationsToday: 50, // mock
        reelsToday: 10,       // mock
      }
    };
  }

  async getJobStatus(tenantId: string, jobId: string) {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.tenantId !== tenantId) throw new NotFoundException('Job not found');
    this.generationGateway.emitJobUpdate(job.id, job.state);
    return job;
  }

  async tweakContent(tenantId: string, dto: TweakContentDto) {
    const content = await this.prisma.contentItem.findUnique({
      where: { id: dto.contentItemId },
      include: { appointment: true }
    });

    if (!content || content.tenantId !== tenantId) {
      throw new NotFoundException('Content not found');
    }

    // Create a new tweak job
    const job = await this.prisma.generationJob.create({
      data: {
        tenantId,
        appointmentId: content.appointmentId,
        clientId: content.appointment.clientId,
        jobPayload: dto as any,
        consentSnapshot: {} as any, // Mock
        brandDnaSnapshot: {} as any, // Mock
        brandDnaVersion: 1,
        outputFormats: [],
        platforms: [],
        state: 'created',
      }
    });

    await contentGenerationQueue.add(`tweak:${job.id}`, { jobId: job.id }, { jobId: job.id });

    this.generationGateway.emitJobUpdate(job.id, job.state);

    return {
      jobId: job.id,
      estimatedSeconds: 15,
    };
  }

  async getRateLimitStatus(tenantId: string) {
    // Determine limits based on subscription tier
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    
    // Compute current usage from DB (count jobs created today)
    // Mocking response for now
    return {
      generationsToday: 50,
      reelsToday: 10,
    };
  }
}
