import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';
import { GeminiLabGenerateDto } from './dto/gemini-lab.dto';
import {
  DraftStoryDto,
  SaveGuidedDnaDto,
  SuggestAudienceDto,
  SuggestEssenceDto,
  SuggestIdentityDto,
  SuggestStrategyDto,
} from './dto/guided-dna.dto';
import { GeminiLabDnaService } from './gemini-lab-dna.service';
import { GeminiLabService } from './gemini-lab.service';

type LabFiles = {
  templateRef?: Express.Multer.File[];
  photo?: Express.Multer.File[];
  photo2?: Express.Multer.File[];
  before?: Express.Multer.File[];
  after?: Express.Multer.File[];
};

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('gemini-lab')
export class GeminiLabController {
  constructor(
    private readonly geminiLabService: GeminiLabService,
    private readonly guidedDna: GeminiLabDnaService,
  ) {}

  @Get('brand-dna')
  getGuidedDna(@Req() req: { user: { tenantId: string } }) {
    return this.guidedDna.getState(req.user.tenantId);
  }

  @Put('brand-dna')
  saveGuidedDna(@Req() req: { user: { tenantId: string } }, @Body() dto: SaveGuidedDnaDto) {
    return this.guidedDna.saveDraft(req.user.tenantId, dto.currentStep, dto.draft);
  }

  @Post('brand-dna/complete')
  completeGuidedDna(@Req() req: { user: { tenantId: string } }, @Body() dto: SaveGuidedDnaDto) {
    return this.guidedDna.complete(req.user.tenantId, dto.draft);
  }

  @Post('brand-dna/suggest/identity')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suggestIdentity(@Req() req: { user: { tenantId: string } }, @Body() dto: SuggestIdentityDto) {
    return this.guidedDna.suggestIdentity(req.user.tenantId, dto);
  }

  @Post('brand-dna/suggest/essence')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suggestEssence(@Req() req: { user: { tenantId: string } }, @Body() dto: SuggestEssenceDto) {
    return this.guidedDna.suggestEssence(req.user.tenantId, dto);
  }

  @Post('brand-dna/suggest/audience')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suggestAudience(@Req() req: { user: { tenantId: string } }, @Body() dto: SuggestAudienceDto) {
    return this.guidedDna.suggestAudience(req.user.tenantId, dto);
  }

  @Post('brand-dna/suggest/strategy')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suggestStrategy(@Req() req: { user: { tenantId: string } }, @Body() dto: SuggestStrategyDto) {
    return this.guidedDna.suggestStrategy(req.user.tenantId, dto);
  }

  @Post('brand-dna/draft-story')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  draftStory(@Req() req: { user: { tenantId: string } }, @Body() dto: DraftStoryDto) {
    return this.guidedDna.draftStory(req.user.tenantId, dto.draft);
  }

  @Post('generate')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'templateRef', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
        { name: 'photo2', maxCount: 1 },
        { name: 'before', maxCount: 1 },
        { name: 'after', maxCount: 1 },
      ],
      { limits: { fileSize: 8 * 1024 * 1024 } },
    ),
  )
  generate(
    @Req() req: { user: { tenantId: string } },
    @Body() dto: GeminiLabGenerateDto,
    @UploadedFiles() files: LabFiles,
  ) {
    return this.geminiLabService.generate({
      tenantId: req.user.tenantId,
      dto,
      files: {
        templateRef: files?.templateRef?.[0],
        photo: files?.photo?.[0] || files?.before?.[0],
        photo2: files?.photo2?.[0] || files?.after?.[0],
      },
    });
  }
}
