import { Request } from 'express';

export interface BaseUser {
  auth0_id: string;
  email: string;
  name: string;
}

export interface Student extends BaseUser {
  student_id: string;
}

export interface Instructor extends BaseUser {}

export interface Admin extends BaseUser {}

export interface Auth0User {
  sub: string;
  email: string;
  name: string;
  [key: string]: any;
}

export enum UserRole {
  ADMIN = 'Administrator',
  INSTRUCTOR = 'Instructor',
  STUDENT = 'Student'
}

export interface Auth0UserRole {
  id: string;
  name: UserRole;
  description: string;
}

export interface UserSyncResult {
  synced: boolean;
  action: 'created' | 'updated' | 'exists';
  role: UserRole;
  user: BaseUser;
}

// minimal jwt types
export interface JWTPayload {
  sub: string;
  permissions: string[]; // role permissions
  [key: string]: any;
}


// request format after using the express-oauth2-jwt-bearer middleware
export interface AuthenticatedRequest extends Request {
  auth: {
    payload: JWTPayload;
    header: any;
    token: string;
  };
}

// Minimal Auth0 Management API types
export interface Auth0ManagementUser {
  user_id: string;
  email: string;
  name: string;
}

export interface Auth0TokenResponse {
  access_token: string;
  expires_in: number;
}
