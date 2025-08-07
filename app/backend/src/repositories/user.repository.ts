import { BaseUser, Student, Instructor, Admin, UserRole } from '../types/user.types';
const db = require('../utils/database');

export class UserRepository {
  async findUserByAuth0Id(auth0Id: string): Promise<{ user: BaseUser; role: UserRole } | null> {
    try {
      // Check admins table
      const admin = await db('admins').where('auth0_id', auth0Id).first();
      if (admin) {
        return {
          user: {
            auth0_id: admin.auth0_id,
            email: admin.email,
            name: admin.name
          },
          role: UserRole.ADMIN
        };
      }

      // Check instructor table
      const instructor = await db('instructor').where('auth0_id', auth0Id).first();
      if (instructor) {
        return {
          user: {
            auth0_id: instructor.auth0_id,
            email: instructor.email,
            name: instructor.name
          },
          role: UserRole.INSTRUCTOR
        };
      }

      // Check student table
      const student = await db('student').where('auth0_id', auth0Id).first();
      if (student) {
        return {
          user: {
            auth0_id: student.auth0_id,
            email: student.email || '',
            name: student.name || ''
          },
          role: UserRole.STUDENT
        };
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to find user: ${error}`);
    }
  }

  async createAdmin(userData: BaseUser): Promise<Admin> {
    try {
      const [admin] = await db('admins')
        .insert({
          auth0_id: userData.auth0_id,
          email: userData.email,
          name: userData.name
        })
        .returning('*');
      return admin;
    } catch (error) {
      throw new Error(`Failed to create admin: ${error}`);
    }
  }

  async createInstructor(userData: BaseUser): Promise<Instructor> {
    try {
      const [instructor] = await db('instructor')
        .insert({
          auth0_id: userData.auth0_id,
          email: userData.email,
          name: userData.name
        })
        .returning('*');
      return instructor;
    } catch (error) {
      throw new Error(`Failed to create instructor: ${error}`);
    }
  }

  async updateUser(auth0Id: string, role: UserRole, updateData: Partial<BaseUser>): Promise<BaseUser> {
    try {
      const tableName = role === UserRole.ADMIN ? 'admins' : 
                       role === UserRole.INSTRUCTOR ? 'instructor' : 'student';

      const [updatedUser] = await db(tableName)
        .where('auth0_id', auth0Id)
        .update(updateData)
        .returning('*');

      if (!updatedUser) {
        throw new Error('User not found for update');
      }

      return {
        auth0_id: updatedUser.auth0_id,
        email: updatedUser.email,
        name: updatedUser.name
      };
    } catch (error) {
      throw new Error(`Failed to update user: ${error}`);
    }
  }
}
