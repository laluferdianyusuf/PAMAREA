import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { UploadedFile } from '../common/types/uploaded-file.type.js';
@Injectable()
export class StorageService {
  private readonly uploadDir = join(process.cwd(), 'uploads', 'patrols');

  async saveImage(file: UploadedFile) {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'FILE_BUFFER_MISSING',
        message: 'File tidak valid',
      });
    }

    await mkdir(this.uploadDir, {
      recursive: true,
    });

    const extension =
      file.originalname.split('.').pop()?.toLowerCase() || 'jpg';

    const filename = `${randomUUID()}.${extension}`;

    const filePath = join(this.uploadDir, filename);

    await writeFile(filePath, file.buffer);

    return {
      filename,
      url: `/uploads/patrols/${filename}`,
    };
  }
}
