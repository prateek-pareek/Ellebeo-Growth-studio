import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = { getOrThrow: jest.fn().mockReturnValue('test-access-secret') } as unknown as ConfigService;
    strategy = new JwtStrategy(configService);
  });

  it('reads role from a Growth Studio token (singular `role`)', async () => {
    const result = await strategy.validate({ sub: 'user-1', role: 'Technician', tenantId: 'tenant-1' });
    expect(result).toEqual({ userId: 'user-1', role: 'technician', tenantId: 'tenant-1' });
  });

  it('falls back to the first entry of `roles` for admin-portal tokens', async () => {
    const result = await strategy.validate({ sub: 'user-1', roles: ['Admin', 'technician'] });
    expect(result).toEqual({ userId: 'user-1', role: 'admin', tenantId: undefined });
  });

  it('passes through an undefined role when neither claim is present', async () => {
    const result = await strategy.validate({ sub: 'user-1' });
    expect(result).toEqual({ userId: 'user-1', role: undefined, tenantId: undefined });
  });
});
