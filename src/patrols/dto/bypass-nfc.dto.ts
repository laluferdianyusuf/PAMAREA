import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NfcBypassReason } from '../../generated/prisma/enums.js';

export class BypassNfcDto {
  @IsEnum(NfcBypassReason)
  reason: NfcBypassReason;

  @ValidateIf((object) => object.reason === NfcBypassReason.OTHER)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
