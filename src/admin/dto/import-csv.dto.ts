import { IsNotEmpty, IsString } from 'class-validator';

export class ImportCsvDto {
  @IsString()
  @IsNotEmpty()
  csv: string;
}
