import React from 'react';
import { Button } from './ui/button';

const StudentImportResults = ({ importResults, onCompleted }) => {
  if (!importResults) {
    return null;
  }

  const createdCount = importResults.successful.filter(s => s.status === 'created').length;
  const enrolledCount = importResults.successful.filter(s => s.status === 'enrolled').length;
  const alreadyEnrolledCount = importResults.successful.filter(s => s.status === 'already_enrolled').length;
  const failedCount = importResults.failed.length;
  const auth0CreatedCount = importResults.successful.filter(s => s.auth0_created).length;
  const roleAssignedCount = importResults.successful.filter(s => s.role_assigned).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Import Results</h2>
        <Button onClick={onCompleted}>
          Done
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{importResults.total}</div>
          <div className="text-sm text-blue-800">Total from LMS</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-600">{createdCount}</div>
          <div className="text-sm text-green-800">Created</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-600">{enrolledCount}</div>
          <div className="text-sm text-blue-800">Enrolled</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-600">{alreadyEnrolledCount}</div>
          <div className="text-sm text-gray-800">Already Enrolled</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">{failedCount}</div>
          <div className="text-sm text-red-800">Failed</div>
        </div>
      </div>

      {/* Additional Info */}
      {(auth0CreatedCount > 0 || roleAssignedCount > 0) && (
        <div className="bg-gray-50 border rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Auth0 Integration Summary:</h3>
          <div className="space-y-1 text-sm text-gray-600">
            {auth0CreatedCount > 0 && (
              <div>- New Auth0 users created: {auth0CreatedCount}</div>
            )}
            {roleAssignedCount > 0 && (
              <div>- Student roles assigned: {roleAssignedCount}</div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Results Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Detailed Results</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Successful imports */}
              {importResults.successful.map((student, index) => (
                <tr key={index} className={
                  student.status === 'created' ? 'bg-green-50' :
                  student.status === 'enrolled' ? 'bg-blue-50' :
                  student.status === 'already_enrolled' ? 'bg-gray-50' : 
                  'bg-gray-50'
                }>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {student.student_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      student.status === 'created' ? 'bg-green-100 text-green-800' :
                      student.status === 'enrolled' ? 'bg-blue-100 text-blue-800' :
                      student.status === 'already_enrolled' ? 'bg-gray-100 text-gray-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {student.status === 'created' ? 'Created' :
                       student.status === 'enrolled' ? 'Enrolled' :
                       student.status === 'already_enrolled' ? 'Already Enrolled' :
                       student.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {student.reason ? student.reason :
                     student.auth0_created ? 'Auth0 user created with student role' :
                     student.needs_auth0_setup ? 'Needs Auth0 setup' :
                     'Successfully processed'}
                  </td>
                </tr>
              ))}
              
              {/* Failed imports */}
              {importResults.failed.map((student, index) => (
                <tr key={`failed-${index}`} className="bg-red-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {student.student_id || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {student.email || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                      Failed
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-red-600">
                    {student.error}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Summary */}
      <div className="flex justify-between items-center text-sm text-gray-600 pt-4 border-t">
        <div>
          Total: {importResults.total} | 
          Created: {createdCount} | 
          Enrolled: {enrolledCount} | 
          Already Enrolled: {alreadyEnrolledCount} | 
          Failed: {failedCount}
        </div>
        <div>
          {auth0CreatedCount > 0 && `${auth0CreatedCount} Auth0 users created`}
        </div>
      </div>
    </div>
  );
};

export default StudentImportResults;