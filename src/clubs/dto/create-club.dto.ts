import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateClubDto {
    @IsString()
    @IsNotEmpty({ message: 'Le nom du club est obligatoire' })
    name: string;

    @IsString()
    @IsOptional()
    @Matches(/^[a-z0-9-]+$/, {
        message: 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets'
    })
    slug?: string;
}