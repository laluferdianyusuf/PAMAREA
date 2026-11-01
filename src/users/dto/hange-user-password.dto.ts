import { IsString, MinLength } from 'class-validator';

export class ChangeUserPasswordDto {
  @IsString()
  @MinLength(8, {
    message: 'Password baru minimal 8 karakter.',
  })
  newPassword: string;
}
