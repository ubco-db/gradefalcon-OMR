import { Auth0User, Auth0TokenResponse, BaseUser, Auth0ManagementUser, UserRole, Auth0UserRole } from '../types/user.types';

export class Auth0Service {
  private managementToken: string | null = null;
  private tokenExpiry: number = 0;

 /**
 * Retrieves the roles assigned to a user by their Auth0 ID from the Auth0 Management API.
 * 
 * @param auth0Id - The Auth0 unique identifier for the user
 * @returns A promise that resolves to an array of user roles, or null if no roles found, user doesn't exist, or an error occurs
 */
async getUserRoles(auth0Id: string): Promise<UserRole[] | null> {
  try {
    const token = await this.getToken();
    const response = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}/roles`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
      return null;
    }

    const roles = await response.json() as Auth0UserRole[];
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

      const response = await fetch(
        `https://${process.env.AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) {
        return null;
      }
      const partialAuth0ManagementUser = await response.json() as Partial<Auth0ManagementUser>;
      // console.log(partialAuth0ManagementUser);
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
        scope: 'read:users'
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
