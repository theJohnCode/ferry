import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { LedgerService } from '../ledger/ledger.service';
import { ListTransactionsDto } from '../ledger/dto/list-transactions.dto';
import { PaginatedTransactionsResponseDto } from '../ledger/dto/transaction-response.dto';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletsService } from './wallets.service';
import {
  CreateWalletResponseDto,
  WalletResponseDto,
} from './dto/wallet-response.dto';

@ApiTags('Wallets')
@Controller()
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Post('wallets')
  @ApiOperation({
    summary: 'Create a wallet with an email address, a mobile number, or both.',
  })
  @ApiCreatedResponse({ type: CreateWalletResponseDto })
  public createWallet(
    @Body() dto: CreateWalletDto,
  ): Promise<CreateWalletResponseDto> {
    return this.walletsService.createWallet(dto);
  }

  @Get('wallets/:id')
  @ApiOperation({
    summary:
      'Read a wallet: every balance it holds plus the total equivalent in USD.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Wallet id.' })
  @ApiOkResponse({ type: WalletResponseDto })
  public getWallet(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: string,
  ): Promise<WalletResponseDto> {
    return this.walletsService.getWallet(id);
  }

  @Get('wallets/:id/transactions')
  @ApiOperation({
    summary:
      'Transaction history for a wallet, newest first, paginated and filterable by type and currency.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Wallet id.' })
  @ApiOkResponse({ type: PaginatedTransactionsResponseDto })
  public listTransactions(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: string,
    @Query() query: ListTransactionsDto,
  ): Promise<PaginatedTransactionsResponseDto> {
    return this.ledgerService.listTransactions(id, query);
  }
}
