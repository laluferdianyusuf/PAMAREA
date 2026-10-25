import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangeUserPhotoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  photoUrl: string;
}
