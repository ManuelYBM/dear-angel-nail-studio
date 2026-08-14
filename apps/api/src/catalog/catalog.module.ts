import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AdminCatalogController, CatalogController } from './catalog.controller';
import { CatalogBootstrapService } from './catalog-bootstrap.service';
import { CatalogDemoService } from './catalog-demo.service';
import { CatalogService } from './catalog.service';

@Module({
  imports: [IdentityModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, CatalogBootstrapService, CatalogDemoService],
  exports: [CatalogService],
})
export class CatalogModule {}
