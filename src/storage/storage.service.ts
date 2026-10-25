import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { UploadedFile } from '../common/types/uploaded-file.type.js';

@Injectable()
export class StorageService {
  private readonly patrolUploadDir = join(process.cwd(), 'uploads', 'patrols');

  private readonly userUploadDir = join(process.cwd(), 'uploads', 'users');

  private validateImage(file: UploadedFile) {
    if (!file?.buffer) {
      throw new BadRequestException({
        code: 'FILE_BUFFER_MISSING',
        message: 'File tidak valid',
      });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_TYPE',
        message: 'Format foto harus JPG, PNG, atau WebP',
      });
    }

    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Ukuran foto maksimal 5 MB',
      });
    }
  }

  async saveImage(file: UploadedFile) {
    this.validateImage(file);

    await mkdir(this.patrolUploadDir, {
      recursive: true,
    });

    const extension = this.getImageExtension(file);
    const filename = `${randomUUID()}${extension}`;

    await writeFile(join(this.patrolUploadDir, filename), file.buffer);

    return {
      filename,
      url: `/uploads/patrols/${filename}`,
    };
  }

  async saveUserPhoto(file: UploadedFile) {
    this.validateImage(file);

    await mkdir(this.userUploadDir, {
      recursive: true,
    });

    const extension = this.getImageExtension(file);
    const filename = `${randomUUID()}${extension}`;

    await writeFile(join(this.userUploadDir, filename), file.buffer);

    return {
      filename,
      url: `/uploads/users/${filename}`,
    };
  }

  private getImageExtension(file: UploadedFile): string {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    return extensions[file.mimetype];
  }
}
