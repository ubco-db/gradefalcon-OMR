import { NextFunction, response, Response } from 'express';
import { UserSyncService } from '@/services/user-sync.service';
import { Auth0Service } from '@/services/auth0.service';
import { AuthenticatedRequest, BaseUser, UserRole } from '../types/user.types';
import { ErrorResponseDto, SyncUserResponseDto } from '@/types/user.dto';

export class UserSyncController {
  private userSyncService: UserSyncService;
  private auth0Service: Auth0Service;

  constructor() {
    this.userSyncService = new UserSyncService();
    this.auth0Service = new Auth0Service();
  }

  syncCurrentUser = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth?.payload?.sub) {
        const errorResponse: ErrorResponseDto = {error: 'Unauthorized: Missing usere identification'}
        res.status(401).json({ errorResponse });
        return;
      }

      const auth0Id = req.auth.payload.sub;

      const existingUser = await this.userSyncService.findUserByAuth0Id(auth0Id);

      if (existingUser) {
        const syncUserResponseDto: SyncUserResponseDto = {
          message: 'User already exists',
          data: {
            synced: true,
            action: "exists",
            role: existingUser.role,
            user: existingUser.user
          }
        }
        res.status(200).json(syncUserResponseDto);
        return;
      }

      const baseUser = await this.auth0Service.getUserById(auth0Id);
      console.log("BaseUser: ", baseUser);
      if (!baseUser) {
        const errorResponse: ErrorResponseDto = {
        error: 'User not found in Auth0'
      };
      res.status(404).json(errorResponse);
      return;
      }

      // Fetch user roles from Auth0
      const userRoles = await this.auth0Service.getUserRoles(auth0Id);
      console.log("User Role", userRoles);
      if (!userRoles || userRoles.length === 0) {
        const errorResponse: ErrorResponseDto = {
          error: 'User has no assigned roles',
          message: 'Please contact an administrator to assign appropriate roles'
        };
        res.status(403).json(errorResponse);
        return;
      }
      
      // Determine primary role
      const primaryRole = this.determinePrimaryRole(userRoles);
      if (!primaryRole) {
        const errorResponse: ErrorResponseDto = {
          error: 'Invalid user role configuration',
          message: 'User roles are not properly configured'
        };
        res.status(403).json(errorResponse);
        return;
      }

      // Sync user to database
      const syncResult = await this.userSyncService.syncUserToDatabase(baseUser, primaryRole);

      const response: SyncUserResponseDto = {
        message: 'User sync completed successfully',
        data: syncResult
      };
      res.status(200).json(response);
    } catch (error) {
      console.error('Error in user sync:', error);
      const errorResponse: ErrorResponseDto = {
        error: 'Failed to sync user',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(errorResponse);
    }
  };

  /**
   * Determines the primary role for a user based on their assigned roles.
   * Follows a hierarchy: Admin > Instructor > Student
   * 
   * @param roles - Array of user roles from Auth0
   * @returns The primary UserRole or null if no valid role found
   */
  private determinePrimaryRole(roles: UserRole[]): UserRole | null {
    const roleHierarchy = [UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.STUDENT];
    
    for (const role of roleHierarchy) {
      if (roles.includes(role)) {
        return role;
      }
    }
    
    return null;
  }
}


const userSyncController = new UserSyncController();
export const { syncCurrentUser } = userSyncController;
