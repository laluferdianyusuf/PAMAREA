import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class SubmitPhotoDto {
  @IsOptional()
  @IsUUID()
  answerId?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  capturedAt?: string;
}
