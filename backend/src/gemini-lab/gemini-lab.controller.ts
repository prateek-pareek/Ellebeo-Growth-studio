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
import { GeminiLabGenerateDto, GeminiLabKeepDto, GeminiLabSelectionDto } from './dto/gemini-lab.dto';
import {
  DraftStoryDto,
  SaveGuidedDnaDto,
  ScanWebsiteDto,
  SuggestAudienceDto,
  SuggestEssenceDto,
  SuggestIdentityDto,
  SuggestStrategyDto,
} from './dto/guided-dna.dto';
import { GeminiLabDnaService } from './gemini-lab-dna.service';
import { GeminiLabService } from './gemini-lab.service';
import { ALL_FORMAT_IDS, POST_FORMATS } from './gemini-lab-formats';

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

  /** The kinds of post this studio can make — drives the picker in the Lab UI. */
  @Get('formats')
  formats() {
    return {
      formats: ALL_FORMAT_IDS.map((id) => {
        const f = POST_FORMATS[id];
        return { id: f.id, label: f.label, brief: f.brief, photo: f.photo, needsRealData: f.needsRealData };
      }),
    };
  }

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

  @Post('brand-dna/adjust')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  adjustBrand(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { draft?: unknown; wish?: string },
  ) {
    return this.guidedDna.adjustBrand(req.user.tenantId, body?.draft, body?.wish ?? '');
  }

  @Post('brand-dna/draft-story')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  draftStory(@Req() req: { user: { tenantId: string } }, @Body() dto: DraftStoryDto) {
    return this.guidedDna.draftStory(req.user.tenantId, dto.draft);
  }

  @Post('brand-dna/scan-website')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  scanWebsite(@Req() req: { user: { tenantId: string } }, @Body() dto: ScanWebsiteDto) {
    return this.guidedDna.scanWebsite(req.user.tenantId, dto.url);
  }

  /** The layouts this salon can be composed in — the shared library plus its own. */
  @Get('templates')
  async listTemplates(@Req() req: { user: { tenantId: string } }) {
    const templates = await this.guidedDna.getTemplates(req.user.tenantId);
    return { templates };
  }

  /** Saves a layout. Refused at save time if it would render a broken post. */
  @Put('templates')
  saveTemplate(@Req() req: { user: { tenantId: string } }, @Body() body: any) {
    return this.guidedDna.saveTemplate(req.user.tenantId, body);
  }

  /** Writes the shared library into the database. Idempotent. */
  @Post('templates/seed')
  seedTemplates() {
    return this.guidedDna.seedTemplateLibrary();
  }

  /** The editable prompt blocks: shipped default, this studio's override, and what is in force. */
  @Get('prompt-blocks')
  getPromptBlocks(@Req() req: { user: { tenantId: string } }) {
    return this.guidedDna.getPromptBlocks(req.user.tenantId);
  }

  @Put('prompt-blocks')
  savePromptBlocks(@Req() req: { user: { tenantId: string } }, @Body() body: { overrides?: unknown }) {
    return this.guidedDna.savePromptBlocks(req.user.tenantId, body?.overrides);
  }

  /** Rewrites one block from a plain-language wish. Returns a suggestion; never saves it. */
  @Post('prompt-blocks/improve')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  improvePromptBlock(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { id: string; wish: string },
  ) {
    return this.guidedDna.improvePromptBlock(req.user.tenantId, body?.id as any, body?.wish);
  }

  /** The studio's kept posts — its own library, and what the calendar reads. */
  @Get('posts')
  listPosts(@Req() req: { user: { tenantId: string } }) {
    return this.geminiLabService.listPosts(req.user.tenantId);
  }

  /** Keeps a generated post, optionally planning it for a date. */
  @Post('posts')
  keepPost(@Req() req: { user: { tenantId: string } }, @Body() dto: GeminiLabKeepDto) {
    return this.geminiLabService.keepPost(req.user.tenantId, dto);
  }

  /** Builds a slideshow reel plan from kept posts, in the order given. */
  @Post('posts/reel')
  buildReel(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { postIds?: string[] },
  ) {
    return this.geminiLabService.buildReelPlan(req.user.tenantId, body?.postIds ?? []);
  }

  /** Sets or clears the date a kept post is planned for. */
  @Put('posts/schedule')
  schedulePost(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { id: string; scheduledFor?: string | null },
  ) {
    return this.geminiLabService.schedulePost(req.user.tenantId, body?.id, body?.scheduledFor ?? null);
  }

  /** Records which option the technician picked — the only real preference signal the system gets. */
  @Post('selection')
  selection(
    @Req() req: { user: { tenantId: string } },
    @Body() dto: GeminiLabSelectionDto,
  ) {
    return this.geminiLabService.recordSelection(req.user.tenantId, dto);
  }

  /** Edits one photo from a written instruction. Guarded — see photo-edit.ts. */
  // Upload ceilings are a backstop against an absurd file, not the working
  // limit. The browser downscales to 2048px before sending and the server
  // downsizes again before use, so nothing above that is ever looked at. At
  // 8MB the ceiling WAS the working limit — an ordinary phone photo is 10-20MB
  // and came back "File too large", which is what "the image won't edit" was.
  @Post('photo-edit')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileFieldsInterceptor([{ name: 'photo', maxCount: 1 }], { limits: { fileSize: 30 * 1024 * 1024 } }))
  editPhoto(
    @Req() req: { user: { tenantId: string } },
    @Body() body: { instruction?: string; kind?: string },
    @UploadedFiles() files: { photo?: Express.Multer.File[] },
  ) {
    return this.geminiLabService.editPhoto({
      tenantId: req.user.tenantId,
      file: files?.photo?.[0],
      instruction: body?.instruction ?? '',
      kind: body?.kind ?? 'look',
    });
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
      { limits: { fileSize: 30 * 1024 * 1024 } },
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
