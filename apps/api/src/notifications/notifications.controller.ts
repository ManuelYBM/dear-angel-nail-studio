import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import { NotificationListDto, UpdateNotificationTemplateDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';
import { Body } from '@nestjs/common';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: NotificationListDto) {
    return this.notifications.list(user.id, query.unreadOnly, query.take);
  }

  @Get('unread-count')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }
}

@Roles('ADMIN')
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('templates')
  templates() {
    return this.notifications.templates();
  }

  @Get('deliveries')
  deliveries() {
    return this.notifications.deliveryReport();
  }

  @Patch('templates/:key')
  update(@Param('key') key: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.notifications.updateTemplate(key, dto);
  }
}
