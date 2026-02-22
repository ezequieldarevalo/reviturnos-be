import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentPlant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.plant;
  },
);
