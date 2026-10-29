import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';

@Module({
  imports: [RatesModule, LedgerModule],
  providers: [WalletsService],
  controllers: [WalletsController],
})
export class WalletsModule {}
