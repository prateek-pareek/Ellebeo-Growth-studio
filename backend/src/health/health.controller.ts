import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness probe — used by the Docker HEALTHCHECK and Traefik.
   * Stays cheap and dependency-free so a transient DB blip does not
   * trigger container restarts / blue-green rollbacks.
   */
  @Get()
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness probe — verifies the DB is reachable. Suitable for
   * orchestrators that should hold traffic until dependencies are up.
   */
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up', timestamp: new Date().toISOString() };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
