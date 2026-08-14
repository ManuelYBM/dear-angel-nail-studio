import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';

@Controller('admin/users')
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ) {
    return this.users.create(actor, dto, request);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    return this.users.update(actor, id, dto, request);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: Request,
  ) {
    return this.users.updateStatus(actor, id, dto.status, request);
  }

  @Post(':id/password-reset')
  sendPasswordReset(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.users.sendPasswordReset(actor, id, request);
  }
}
