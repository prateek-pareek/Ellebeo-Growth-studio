import { ConsentGuard } from './consent.guard';

// ConsentGuard is constructed directly with a PrismaClient (not Nest DI), and
// every DB call goes through tagged-template $queryRaw/$executeRaw. A tagged
// template invokes the tag function as fn(strings, ...values), so a plain
// jest.fn() stands in fine — we only care about the resolved value per call.
function makeMockPrisma() {
  return {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
}

const restrictiveDefaults = {
  show_face: false,
  use_name: false,
  allow_tagging: false,
  allow_before_after: false,
  allow_extended_use: false,
};

describe('ConsentGuard', () => {
  describe('validateAtSubmission — Checkpoint 1 (API layer)', () => {
    it('blocks generation with the most restrictive defaults when no consent record exists', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtSubmission('appt-1', 'client-1');

      expect(result).toEqual({
        valid: false,
        reason: 'not_found',
        activeRestrictions: restrictiveDefaults,
      });
    });

    it('blocks generation when consent has been withdrawn', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([
        { status: 'withdrawn', expires_at: null, restrictions: {} },
      ]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtSubmission('appt-1', 'client-1');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('withdrawn');
      expect(result.activeRestrictions).toEqual(restrictiveDefaults);
    });

    it('blocks generation when the consent record has expired', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([
        { status: 'granted', expires_at: new Date(Date.now() - 1000), restrictions: {} },
      ]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtSubmission('appt-1', 'client-1');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('allows generation and surfaces the granted restrictions when consent is active', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([
        {
          status: 'granted',
          expires_at: null,
          restrictions: { show_face: true, use_name: true, allow_tagging: false, allow_before_after: true, allow_extended_use: false },
        },
      ]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtSubmission('appt-1', 'client-1');

      expect(result.valid).toBe(true);
      expect(result.activeRestrictions).toEqual({
        show_face: true,
        use_name: true,
        allow_tagging: false,
        allow_before_after: true,
        allow_extended_use: false,
      });
    });

    it('defaults every restriction to false when the stored JSON is missing fields', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([
        { status: 'granted', expires_at: null, restrictions: { show_face: true } },
      ]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtSubmission('appt-1', 'client-1');

      expect(result.activeRestrictions).toEqual({ ...restrictiveDefaults, show_face: true });
    });
  });

  describe('validateAtProcessing — Checkpoint 2 (worker, re-checked against live DB)', () => {
    const grantedRow = {
      status: 'granted',
      expires_at: null,
      restrictions: { show_face: false, use_name: true, allow_tagging: true, allow_before_after: true, allow_extended_use: true },
    };

    it('blocks the job outright if consent was withdrawn after it was queued', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([{ status: 'withdrawn', expires_at: null, restrictions: {} }]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtProcessing(
        { restrictions: { show_face: true, use_name: true, allow_tagging: true, allow_before_after: true, allow_extended_use: true } } as any,
        'client-1',
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('withdrawn');
    });

    it('blocks the job when a permission the snapshot relied on was tightened since queuing', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([grantedRow]); // live: show_face now false
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtProcessing(
        { restrictions: { show_face: true, use_name: true, allow_tagging: true, allow_before_after: true, allow_extended_use: true } } as any,
        'client-1',
      );

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('restrictions_violated');
      expect(result.activeRestrictions.show_face).toBe(false);
    });

    it('allows the job when live restrictions are unchanged or looser than the snapshot', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([grantedRow]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtProcessing(
        { restrictions: { show_face: false, use_name: false, allow_tagging: false, allow_before_after: false, allow_extended_use: false } } as any,
        'client-1',
      );

      expect(result.valid).toBe(true);
    });

    it('allows the job when there is no snapshot to compare against', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValue([grantedRow]);
      const guard = new ConsentGuard(prisma as any);

      const result = await guard.validateAtProcessing({ restrictions: undefined } as any, 'client-1');

      expect(result.valid).toBe(true);
    });
  });

  describe('handleConsentWithdrawal', () => {
    it('blocks active jobs and completed content, and notifies affected tenants', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ job_id: 'job-1', tenant_id: 'tenant-a', state: 'QUEUED' }])
        .mockResolvedValueOnce([{ content_item_id: 'content-1', tenant_id: 'tenant-b' }]);
      prisma.$executeRaw.mockResolvedValue(undefined);

      const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
      const guard = new ConsentGuard(prisma as any, io as any);

      await guard.handleConsentWithdrawal('client-1');

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2); // one UPDATE for jobs, one for content
      expect(io.to).toHaveBeenCalledTimes(2); // one room per affected tenant
      expect(io.emit).toHaveBeenCalledWith('consent:withdrawn', expect.objectContaining({ clientId: 'client-1' }));
    });

    it('skips the UPDATE and emit calls entirely when nothing is affected', async () => {
      const prisma = makeMockPrisma();
      prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
      const guard = new ConsentGuard(prisma as any, io as any);

      await guard.handleConsentWithdrawal('client-1');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });
});
