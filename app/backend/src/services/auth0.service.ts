import { Auth0User, Auth0TokenResponse, BaseUser, Auth0ManagementUser, UserRole, Auth0UserRole } from '../types/user.types';

// Rate limiting utility functions
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limiter class for Auth0 API calls
class Auth0RateLimiter {
  private lastCall: number = 0;
  private minInterval: number = 600; // 600ms between calls (slightly under 2 requests per second)

  async waitForNextCall(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall;
      await delay(waitTime);
    }
    this.lastCall = Date.now();
  }
}

export class Auth0Service {
  private managementToken: string | null = null;
  private tokenExpiry: number = 0;
  private rateLimiter: Auth0RateLimiter = new Auth0RateLimiter();

  /**
   * Wrapper function for Auth0 API calls with rate limiting and retry logic
   */
  private async makeAuth0Request<T>(requestFn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.waitForNextCall();
        return await requestFn();
      } catch (error: any) {
        if (error.status === 429 || (error.response && error.response.status === 429)) {
          console.log(`Rate limit hit on attempt ${attempt}. Waiting before retry...`);
          await delay(Math.pow(2, attempt) * 1000); // Exponential backoff
          if (attempt === maxRetries) {
            throw new Error(`Rate limit exceeded after ${maxRetries} attempts`);
          }
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unexpected error in makeAuth0Request');
  }

  /**
   * Creates a new user in Auth0
   * 
   * @param email - User's email address
   * @param name - User's full name
   * @param connection - Auth0 connection (defaults to 'Username-Password-Authentication')
   * @returns Promise that resolves to the created user's Auth0 data
   */
  async createUser(email: string, name: string, connection: string = 'Username-Password-Authentication'): Promise<BaseUser | null> {
    try {
      const token = await this.getToken();

      const userData = {
        email,
        name,
        connection,
        email_verified: false,
        password: this.generateTemporaryPassword()
      };

      const createdUser = await this.makeAuth0Request(async () => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Auth0 user creation failed: ${JSON.stringify(errorData)}`);
        }

        return await response.json() as Auth0ManagementUser;
      });

      return {
        auth0_id: createdUser.user_id,
        email: createdUser.email,
        name: createdUser.name
      } as BaseUser;

    } catch (error) {
      console.error(`Error creating user in Auth0:`, error);
      throw new Error(`Failed to create user in Auth0: ${error}`);
    }
  }

  /**
   * Finds user by email in Auth0
   */
  async getUserByEmail(email: string): Promise<BaseUser | null> {
    try {
      const token = await this.getToken();

      const users = await this.makeAuth0Request(async () => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (!response.ok) {
          return [];
        }

        return await response.json() as Auth0ManagementUser[];
      });

      if (users.length > 0) {
        const user = users[0];
        return {
          auth0_id: user.user_id,
          email: user.email,
          name: user.name
        } as BaseUser;
      }

      return null;

    } catch (error) {
      console.error(`Error finding user by email:`, error);
      return null;
    }
  }

  /**
   * Gets the student role ID from Auth0
   */
  async getStudentRoleId(): Promise<string | null> {
    try {
      const token = await this.getToken();

      const roles = await this.makeAuth0Request(async () => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/roles`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch roles: ${response.status}`);
        }

        return await response.json() as Auth0UserRole[];
      });

      const studentRole = roles.find((role: Auth0UserRole) => role.name === UserRole.STUDENT);
      return studentRole?.id || null;

    } catch (error) {
      console.error('Error getting student role:', error);
      return null;
    }
  }

  /**
   * Gets user's current roles
   */
  async getUserRolesById(auth0Id: string): Promise<Auth0UserRole[]> {
    try {
      const token = await this.getToken();

      return await this.makeAuth0Request(async (): Promise<Auth0UserRole[]> => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}/roles`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (!response.ok) {
          return [];
        }

        return await response.json() as Auth0UserRole[];
      });

    } catch (error) {
      console.error(`Error fetching user roles for ${auth0Id}:`, error);
      return [];
    }
  }

  /**
   * Assigns student role to a user if they don't have any roles
   */
  async ensureStudentRole(auth0Id: string): Promise<boolean> {
    try {
      // Check current roles
      const currentRoles = await this.getUserRolesById(auth0Id);
      
      // If user already has roles, don't modify them
      if (currentRoles.length > 0) {
        console.log(`User ${auth0Id} already has roles:`, currentRoles.map((r: Auth0UserRole) => r.name));
        return true;
      }

      // Get student role ID
      const studentRoleId = await this.getStudentRoleId();
      if (!studentRoleId) {
        throw new Error('Student role not found in Auth0. Please create a "Student" role first.');
      }

      // Assign student role
      const token = await this.getToken();
      await this.makeAuth0Request(async () => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}/roles`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              roles: [studentRoleId]
            })
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to assign student role: ${JSON.stringify(errorData)}`);
        }

        return response;
      });

      console.log(`Assigned student role to user: ${auth0Id}`);
      return true;

    } catch (error) {
      console.error(`Error ensuring student role for ${auth0Id}:`, error);
      throw error;
    }
  }

  /**
   * Generates a temporary password for new users
   * Users will need to reset this password on first login
   */
  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

 /**
 * Retrieves the roles assigned to a user by their Auth0 ID from the Auth0 Management API.
 * 
 * @param auth0Id - The Auth0 unique identifier for the user
 * @returns A promise that resolves to an array of user roles, or null if no roles found, user doesn't exist, or an error occurs
 */
async getUserRoles(auth0Id: string): Promise<UserRole[] | null> {
  try {
    const token = await this.getToken();
    
    const roles = await this.makeAuth0Request(async () => {
      const response = await fetch(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}/roles`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) {
        return [];
      }

      return await response.json() as Auth0UserRole[];
    });

    return roles.length > 0 ? roles.map((role) => role.name) : null;

  } catch (error) {
    console.error(`Error fetching roles for user ${auth0Id}:`, error);
    return null;
  }
}

  /**
 * Retrieves a user's basic information by their Auth0 ID from the Auth0 Management API.
 * 
 * @param auth0Id - The Auth0 unique identifier for the user
 * @returns A promise that resolves to a BaseUser object containing the user's basic information (auth0_id, email, name), or null if the user is not found or required fields are missing
 * @throws {Error} Throws an error if the API request fails or an unexpected error occurs during processing
 */
  async getUserById(auth0Id: string): Promise<BaseUser | null> {
    try {
      const token = await this.getToken();

      const partialAuth0ManagementUser = await this.makeAuth0Request(async () => {
        const response = await fetch(
          `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!response.ok) {
          return null;
        }
        
        return await response.json() as Partial<Auth0ManagementUser>;
      });

      if (partialAuth0ManagementUser && typeof partialAuth0ManagementUser.user_id === 'string'
        && typeof partialAuth0ManagementUser.email === 'string'
        && typeof partialAuth0ManagementUser.name === 'string') {
        return {
          auth0_id: partialAuth0ManagementUser.user_id,
          email: partialAuth0ManagementUser.email,
          name: partialAuth0ManagementUser.name
        } as BaseUser;
      }
      return null;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error}`);
    }
  }

  
  private async getToken(): Promise<string> {
    if (this.managementToken && Date.now() < this.tokenExpiry) {
      return this.managementToken;
    }

    const response = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AUTH0_M2M_CLIENT_ID!,
        client_secret: process.env.AUTH0_M2M_CLIENT_SECRET!,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        scope: 'read:users create:users read:roles create:role_members'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Auth0 token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenData = await response.json() as Auth0TokenResponse;
    if (!tokenData.access_token || !tokenData.expires_in) {
      throw new Error('Auth0 token response missing required properties.');
    }
    this.managementToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000;

    return this.managementToken;
  }
}
