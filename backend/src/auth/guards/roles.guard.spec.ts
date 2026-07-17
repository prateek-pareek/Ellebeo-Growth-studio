import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../enums/user-role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const contextWithUser = (user: any): ExecutionContext => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when the route has no @Roles() requirement', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextWithUser({ role: 'technician' }))).toBe(true);
  });

  it('allows access when the required roles array is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(contextWithUser({ role: 'technician' }))).toBe(true);
  });

  it('denies a technician on an admin-only route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
    expect(guard.canActivate(contextWithUser({ role: 'technician' }))).toBe(false);
  });

  it('allows an admin on an admin-only route', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
    expect(guard.canActivate(contextWithUser({ role: 'admin' }))).toBe(true);
  });

  it('matches roles case-insensitively', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
    expect(guard.canActivate(contextWithUser({ role: 'ADMIN' }))).toBe(true);
  });

  it('denies access when there is no authenticated user on the request', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.admin]);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });
});
