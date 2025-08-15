import { UserSyncResult } from "./user.types";

export interface SyncUserResponseDto {
  message: string;
  data: UserSyncResult;
}

export interface ErrorResponseDto {
  error: string;
  message?: string;
}
