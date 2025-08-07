import { UserRepository } from '../repositories/user.repository';
import { BaseUser, UserRole, UserSyncResult } from '../types/user.types';

export class UserSyncService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

    /**
   * Checks if a user exists in the database by their Auth0 ID
   * 
   * @param auth0Id - The Auth0 unique identifier for the user
   * @returns A promise that resolves to user data if found, null otherwise
   */
  async findUserByAuth0Id(auth0Id: string): Promise<{ role: UserRole; user: BaseUser } | null> {
    return await this.userRepository.findUserByAuth0Id(auth0Id);
  }

  async syncUserToDatabase(baseUser: BaseUser, userRole: UserRole): Promise<UserSyncResult> {
    try {
      const auth0Id = baseUser.auth0_id;

      // Check if user exists in database
      const existingUser = await this.userRepository.findUserByAuth0Id(auth0Id);
      
      if (existingUser) {
        return {
          synced: true,
          action: 'exists',
          role: existingUser.role,
          user: existingUser.user
        };
      }
      
      if (userRole === UserRole.STUDENT) {
        throw new Error('Students must be manually added to the system via course creation');
      }

      const createdUser = userRole === UserRole.INSTRUCTOR 
        ? await this.userRepository.createInstructor(baseUser)
        : await this.userRepository.createAdmin(baseUser);

      return {
        synced: true,
        action: 'created',
        role: userRole,
        user: createdUser
      };

    } catch (error) {
      throw new Error(`User sync failed: ${error}`);
    }
  }
}
