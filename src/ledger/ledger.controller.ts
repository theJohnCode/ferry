import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IdempotencyKey } from '../common/idempotency/idempotency-key.decorator';
import { LedgerService } from './ledger.service';
import { DepositDto } from './dto/deposit.dto';
import { SwapDto } from './dto/swap.dto';
import { TransferDto } from './dto/transfer.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';

@ApiTags('Ledger')
@Controller()
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('wallets/:id/deposits')
  @ApiOperation({
    summary: 'Simulate a deposit of a stablecoin into a wallet.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key per deposit.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Wallet id.' })
  @ApiCreatedResponse({
    type: TransactionResponseDto,
    description: 'The deposit transaction, with the new balance reflected.',
  })
  public deposit(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: string,
    @Body() dto: DepositDto,
    @IdempotencyKey() idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    return this.ledgerService.deposit(id, dto, idempotencyKey);
  }

  @Post('wallets/:id/swaps')
  @ApiOperation({
    summary: 'Swap one stablecoin for another inside the same wallet.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key per swap.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Wallet id.' })
  @ApiCreatedResponse({
    type: TransactionResponseDto,
    description: 'The swap transaction and the rate that was applied.',
  })
  public swap(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: string,
    @Body() dto: SwapDto,
    @IdempotencyKey() idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    return this.ledgerService.swap(id, dto, idempotencyKey);
  }

  @Post('transfers')
  @ApiOperation({
    summary:
      'Send stablecoins from one wallet to another, in the same or another currency.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique key per transfer.',
  })
  @ApiCreatedResponse({
    type: TransactionResponseDto,
    description:
      'The transfer transaction with both sides, the rate applied and a timestamp.',
  })
  public transfer(
    @Body() dto: TransferDto,
    @IdempotencyKey() idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    return this.ledgerService.transfer(dto.fromWalletId, dto, idempotencyKey);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Fetch a single transaction by id.' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Transaction id.' })
  @ApiOkResponse({ type: TransactionResponseDto })
  public getTransaction(
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
    )
    id: string,
  ): Promise<TransactionResponseDto> {
    return this.ledgerService.getTransaction(id);
  }
}
