import { Module } from '@nestjs/common';
import { FxProvider } from './fx-provider';
import { RatesService } from './rates.service';
import { RatesController } from './rates.controller';

@Module({
  providers: [FxProvider, RatesService],
  controllers: [RatesController],
  exports: [RatesService],
})
export class RatesModule {}
