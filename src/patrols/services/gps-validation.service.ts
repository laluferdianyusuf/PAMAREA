import { Injectable } from '@nestjs/common';

export interface GpsValidationResult {
  valid: boolean;
  distanceMeters: number;
  radiusMeters: number;
  accuracyMeters: number | null;
}

@Injectable()
export class GpsValidationService {
  /**
   * Menghitung jarak antara dua koordinat GPS
   * menggunakan Haversine Formula.
   *
   * Return dalam meter.
   */
  calculateDistance(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const EARTH_RADIUS_METERS = 6371000;

    const lat1 = this.toRadians(latitude1);
    const lat2 = this.toRadians(latitude2);

    const deltaLat = this.toRadians(latitude2 - latitude1);
    const deltaLon = this.toRadians(longitude2 - longitude1);

    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_METERS * c;
  }

  validate(
    userLatitude: number,
    userLongitude: number,
    pointLatitude: number,
    pointLongitude: number,
    radiusMeters: number,
    accuracyMeters?: number | null,
  ): GpsValidationResult {
    const distanceMeters = this.calculateDistance(
      userLatitude,
      userLongitude,
      pointLatitude,
      pointLongitude,
    );

    return {
      valid: distanceMeters <= radiusMeters,
      distanceMeters: Number(distanceMeters.toFixed(2)),
      radiusMeters,
      accuracyMeters: accuracyMeters ?? null,
    };
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }
}
