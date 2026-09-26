import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignFindingDto {
  @IsUUID()
  @IsNotEmpty()
  assignedTo: string;
}
