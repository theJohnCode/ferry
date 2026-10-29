import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RatesService } from './rates.service';
import { RatesResponseDto } from './dto/rates-response.dto';

@ApiTags('Rates')
@Controller('rates')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Current conversion rates between all supported stablecoins, with the source of the rates and the time they were last refreshed.',
  })
  @ApiOkResponse({ type: RatesResponseDto })
  public getRates(): Promise<RatesResponseDto> {
    return this.ratesService.getRatesOverview();
  }
}
