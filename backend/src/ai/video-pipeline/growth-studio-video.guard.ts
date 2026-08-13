import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { isGrowthStudioVideoEnabled } from './feature-flag';

@Injectable()
export class GrowthStudioVideoGuard implements CanActivate {
  canActivate(): boolean {
    if (!isGrowthStudioVideoEnabled()) {
      throw new NotFoundException();
    }
    return true;
  }
}
