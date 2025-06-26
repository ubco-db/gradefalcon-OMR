import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import useLmsApi from '../api/useLmsApi';
import StudentImportTable from '../components/StudentImportTable';

const ImportStudents = () => {
  const { classId } = useParams();
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getLmsStudents, saveLmsStudents } = useLmsApi();

  const handleImport = async () => {
    setIsLoading(true);
    const { success, data, error } = await getLmsStudents(parseInt(classId));
    if (success) {
      setStudents(data);
    } else {
      // Handle error
      console.error(error);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsLoading(true);
    const { success, data, error } = await saveLmsStudents(parseInt(classId), students);
    if (success) {
      // Handle success - maybe show a success message or redirect
      console.log('Students saved successfully:', data);
    } else {
      // Handle error
      console.error('Error saving students:', error);
    }
    setIsLoading(false);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Import Students</h1>
        <Button onClick={handleImport} disabled={isLoading}>
          {isLoading ? 'Importing...' : 'Import from LMS'}
        </Button>
      </div>
      <StudentImportTable students={students} setStudents={setStudents} />
      {students.length > 0 && (
        <div className="flex justify-end mt-4">
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Students'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImportStudents;