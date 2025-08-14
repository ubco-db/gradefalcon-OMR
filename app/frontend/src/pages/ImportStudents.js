import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import useLmsApi from '../api/useLmsApi';
import StudentImportTable from '../components/StudentImportTable';
import StudentImportResults from '../components/StudentImportResults';

const ImportStudents = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [importResults, setImportResults] = useState(null);
  const { getLmsStudents, saveLmsStudents } = useLmsApi();

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
    setImportResults(null);
  };

  const handleImport = async () => {
    clearMessages();
    setIsLoading(true);
    
    try {
      const { success, data, error } = await getLmsStudents(parseInt(classId));
      if (success) {
        if (data && data.length > 0) {
          setStudents(data);
          setSuccess(`Successfully imported ${data.length} students from LMS`);
        } else {
          setError('No students found in the LMS course. Please check your LMS integration and course settings.');
        }
      } else {
        setError(error || 'Failed to import students from LMS. Please check your LMS integration.');
      }
    } catch (err) {
      setError('An unexpected error occurred while importing students. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    clearMessages();
    setIsSaving(true);
    
    try {
      const { success, data, error } = await saveLmsStudents(parseInt(classId), students);
      if (success) {
        setImportResults(data.results);
        setSuccess(data.message || `Successfully saved ${students.length} students`);
        
        // Show detailed results if available
        if (data.results) {
          const { successful, failed } = data.results;
          if (failed && failed.length > 0) {
            const failureMessages = failed.map(f => `${f.student_id || f.name}: ${f.error}`).join('\n');
            setError(`Some students failed to import:\n${failureMessages}`);
          }
        }
      } else {
        // Handle validation errors with line breaks
        if (error && error.includes('\n')) {
          setError(error);
        } else {
          setError(error || 'Failed to save students. Please try again.');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred while saving students. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Import Students</h1>
        <Button onClick={handleImport} disabled={isLoading || isSaving}>
          {isLoading ? 'Importing...' : 'Import from LMS'}
        </Button>
      </div>

      {error && (
        <Alert className="mb-4 border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            <div className="whitespace-pre-line">{error}</div>
          </AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4 border-green-200 bg-green-50">
          <AlertDescription className="text-green-700">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {!importResults && (
        <>
          <StudentImportTable students={students} setStudents={setStudents} />
          
          {students.length > 0 && (
            <div className="flex justify-end mt-4">
              <Button onClick={handleSave} disabled={isLoading || isSaving}>
                {isSaving ? 'Saving...' : 'Save Students'}
              </Button>
            </div>
          )}
        </>
      )}

      <StudentImportResults 
        importResults={importResults} 
        onCompleted={() => {
          navigate(`/ClassManagement/${classId}`);
        }}
      />
    </div>
  );
};

export default ImportStudents;