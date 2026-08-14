import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { CurrentUser, Public, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/auth.types';
import {
  AssignQuoteDto,
  CalculatorOptionDto,
  CatalogDesignDto,
  CatalogQueryDto,
  CreateQuoteDto,
  ReviewQuoteDto,
} from './catalog.dto';
import { CatalogService } from './catalog.service';
import type { StoredAsset, UploadedAsset } from './catalog.service';

const imageUpload = FileInterceptor('image', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('designs')
  designs(@Query() query: CatalogQueryDto) {
    return this.catalog.listDesigns(undefined, query);
  }

  @Get('designs/personalized')
  personalizedDesigns(@CurrentUser() user: AuthenticatedUser, @Query() query: CatalogQueryDto) {
    return this.catalog.listDesigns(user, query);
  }

  @Public()
  @Get('designs/:id')
  design(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getDesign(id);
  }

  @Public()
  @Get('images/:imageId')
  async catalogImage(@Param('imageId', ParseUUIDPipe) imageId: string, @Res() response: Response) {
    this.sendAsset(response, await this.catalog.catalogImage(imageId), true);
  }

  @Roles(UserRole.CLIENT)
  @Post('designs/:id/favorite')
  favorite(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.toggleFavorite(user, id);
  }

  @Public()
  @Get('calculator')
  calculator() {
    return this.catalog.calculator();
  }

  @Public()
  @Get('calculator/:id/icon')
  async optionIcon(@Param('id', ParseUUIDPipe) id: string, @Res() response: Response) {
    this.sendAsset(response, await this.catalog.optionIcon(id), true);
  }

  @Get('quotes')
  quotes(@CurrentUser() user: AuthenticatedUser) {
    return this.catalog.listQuotes(user);
  }

  @Get('quotes/:id')
  quote(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getQuote(user, id);
  }

  @Roles(UserRole.CLIENT)
  @Post('quotes')
  createQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuoteDto,
    @Req() request: Request,
  ) {
    return this.catalog.createQuote(user, dto, request);
  }

  @Roles(UserRole.NAIL_TECHNICIAN)
  @Post('quotes/:id/claim')
  claimQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.catalog.claimQuote(user, id, request);
  }

  @Roles(UserRole.ADMIN)
  @Patch('quotes/:id/assign')
  assignQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignQuoteDto,
    @Req() request: Request,
  ) {
    return this.catalog.assignQuote(user, id, dto, request);
  }

  @Roles(UserRole.ADMIN, UserRole.NAIL_TECHNICIAN)
  @Patch('quotes/:id/review')
  reviewQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewQuoteDto,
    @Req() request: Request,
  ) {
    return this.catalog.reviewQuote(user, id, dto, request);
  }

  @Post('quotes/:id/images')
  @UseInterceptors(imageUpload)
  uploadQuoteImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedAsset,
    @Req() request: Request,
  ) {
    return this.catalog.uploadQuoteImage(user, id, file, request);
  }

  @Get('quotes/images/:imageId')
  async quoteImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ) {
    this.sendAsset(response, await this.catalog.quoteImage(user, imageId), false);
  }

  private sendAsset(response: Response, asset: StoredAsset, publicCache: boolean) {
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${asset.filename.replace(/["\r\n]/g, '')}"`,
    );
    response.setHeader('Cache-Control', publicCache ? 'public, max-age=3600' : 'private, no-store');
    asset.stream.pipe(response);
  }
}

@Controller('admin/catalog')
@Roles(UserRole.ADMIN)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('designs')
  designs(@CurrentUser() user: AuthenticatedUser, @Query() query: CatalogQueryDto) {
    return this.catalog.listDesigns(user, query, true);
  }

  @Post('designs')
  createDesign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CatalogDesignDto,
    @Req() request: Request,
  ) {
    return this.catalog.createDesign(user, dto, request);
  }

  @Put('designs/:id')
  updateDesign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CatalogDesignDto,
    @Req() request: Request,
  ) {
    return this.catalog.updateDesign(user, id, dto, request);
  }

  @Delete('designs/:id')
  deleteDesign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.catalog.deleteDesign(user, id, request);
  }

  @Post('designs/:id/images')
  @UseInterceptors(imageUpload)
  uploadDesignImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedAsset,
    @Req() request: Request,
  ) {
    return this.catalog.uploadDesignImage(user, id, file, request);
  }

  @Delete('images/:imageId')
  deleteDesignImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() request: Request,
  ) {
    return this.catalog.deleteDesignImage(user, imageId, request);
  }

  @Get('calculator')
  calculator() {
    return this.catalog.calculator(true);
  }

  @Post('calculator')
  createOption(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CalculatorOptionDto,
    @Req() request: Request,
  ) {
    return this.catalog.createOption(user, dto, request);
  }

  @Put('calculator/:id')
  updateOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalculatorOptionDto,
    @Req() request: Request,
  ) {
    return this.catalog.updateOption(user, id, dto, request);
  }

  @Post('calculator/:id/icon')
  @UseInterceptors(imageUpload)
  uploadOptionIcon(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedAsset,
    @Req() request: Request,
  ) {
    return this.catalog.uploadOptionIcon(user, id, file, request);
  }
}
