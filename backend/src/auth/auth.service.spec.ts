import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt');

// firebaseAuth's real value depends on FIREBASE_* env vars being present on
// whatever machine runs the suite — mocked to null so the "not configured"
// branch is deterministic regardless of local/CI environment.
jest.mock('../config/firebase.client', () => ({
  firebaseAuth: null,
  firebaseStorage: null,
}));

// tryProvisionFromCrm() dynamically imports 'pg' and hits a real Postgres
// connection — mocked here so the CRM-fallback branch of login() is
// deterministic and doesn't attempt a network connection in tests.
const mockPgClient = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};
jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => mockPgClient),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;

  const mockPrisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    tenant: {
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('test-refresh-secret'),
    get: jest.fn().mockReturnValue('1d'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockConfigService.getOrThrow.mockReturnValue('test-refresh-secret');
    mockConfigService.get.mockReturnValue('1d');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('register', () => {
    it('rejects an email that is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({ email: 'taken@example.com', password: 'password123', businessName: 'Biz', timezone: 'UTC' }),
      ).rejects.toThrow(HttpException);
    });

    it('creates a user + tenant in a single transaction for a new email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });
      mockPrisma.tenant.create.mockResolvedValue({ id: 'tenant-1' });

      const result = await service.register({
        email: 'new@example.com',
        password: 'password123',
        businessName: 'Biz',
        timezone: 'UTC',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'new@example.com', role: 'technician' }) }),
      );
      expect(result).toEqual({ userId: 'user-1', tenantId: 'tenant-1' });
    });
  });

  describe('login', () => {
    const baseUser = {
      id: 'user-1',
      email: 'tech@example.com',
      passwordHash: 'stored-hash',
      role: 'technician',
      failedLoginAttempts: 0,
      lockedUntil: null,
      tenant: { id: 'tenant-1' },
    };

    it('throws when no local user exists and CRM fallback finds nothing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPgClient.connect.mockResolvedValue(undefined);
      mockPgClient.query.mockResolvedValue({ rows: [] });

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects login while the account is locked out', async () => {
      const future = new Date(Date.now() + 60_000);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, lockedUntil: future });

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(/locked/i);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('increments failedLoginAttempts and rejects on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, failedLoginAttempts: 2 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { failedLoginAttempts: 3 },
      });
    });

    it('locks the account once failed attempts reach 10', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, failedLoginAttempts: 9 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: baseUser.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      const [[updateArgs]] = mockPrisma.user.update.mock.calls;
      expect(updateArgs.data.failedLoginAttempts).toBe(10);
      expect(updateArgs.data.lockedUntil).toBeInstanceOf(Date);
    });

    it('resets failed attempts and returns tokens on correct password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, failedLoginAttempts: 4 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login({ email: baseUser.email, password: 'correct' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }) }),
      );
      expect(result).toEqual(expect.objectContaining({ accessToken: 'signed.jwt.token', refreshToken: expect.any(String) }));
    });
  });

  describe('refreshTokens', () => {
    it('rejects when the token hash has no matching record', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('unknown-token')).rejects.toThrow(UnauthorizedException);
    });

    it('detects reuse of an already-revoked token and revokes the whole session', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100_000),
        user: { role: 'technician', tenant: { id: 'tenant-1' } },
      });

      await expect(service.refreshTokens('reused-token')).rejects.toThrow(/reuse detected/i);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired but non-revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { role: 'technician', tenant: { id: 'tenant-1' } },
      });

      await expect(service.refreshTokens('expired-token')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rotates a valid token: revokes the old one and issues a new pair', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
        user: { role: 'technician', tenant: { id: 'tenant-1' } },
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refreshTokens('valid-token');

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ accessToken: 'signed.jwt.token' }));
    });
  });

  describe('logout', () => {
    it('revokes the refresh token matching the given hash', async () => {
      await service.logout('some-refresh-token');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it('does nothing when no refresh token is supplied', async () => {
      await service.logout('');
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('firebaseLogin', () => {
    it('throws when Firebase is not configured in this environment', async () => {
      await expect(service.firebaseLogin('some-id-token')).rejects.toThrow(/Firebase auth not configured/i);
    });
  });
});
