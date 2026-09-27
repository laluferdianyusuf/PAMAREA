export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}
