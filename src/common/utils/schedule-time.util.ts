import { BadRequestException } from '@nestjs/common';

const SCHEDULE_TIMEZONE = 'Asia/Makassar';
const UTC_OFFSET_HOURS = 8;

export class ScheduleTimeUtil {
  static normalizeTime(value: string): string {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

    if (!match) {
      throw new BadRequestException(
        `Format jam tidak valid: ${value}. Gunakan HH:mm, contoh 08:00.`,
      );
    }

    return `${match[1]}:${match[2]}`;
  }

  static parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Format tanggal tidak valid: ${value}. Gunakan YYYY-MM-DD.`,
      );
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`Tanggal tidak valid: ${value}`);
    }

    return date;
  }

  static combineDateTime(date: Date, time: string, dayOffset = 0): Date {
    const normalized = this.normalizeTime(time);
    const [hour, minute] = normalized.split(':').map(Number);

    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + dayOffset,
        hour - UTC_OFFSET_HOURS,
        minute,
        0,
        0,
      ),
    );
  }

  static formatTimestamp(value: Date): {
    utc: string;
    local: string;
  } {
    return {
      utc: value.toISOString(),
      local: new Intl.DateTimeFormat('sv-SE', {
        timeZone: SCHEDULE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(value),
    };
  }

  static formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
