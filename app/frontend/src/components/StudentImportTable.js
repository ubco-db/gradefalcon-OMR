import React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { Input } from './ui/input';

const StudentImportTable = ({ students, setStudents }) => {
  const handleInputChange = (index, field, value) => {
    const newStudents = [...students];
    newStudents[index][field] = value;
    setStudents(newStudents);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>LMS User ID</TableHead>
          <TableHead>Student ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student, index) => (
          <TableRow key={student.lms_user_id}>
            <TableCell>{student.lms_user_id}</TableCell>
            <TableCell>
              <Input
                value={student.student_id}
                onChange={(e) => handleInputChange(index, 'student_id', e.target.value)}
              />
            </TableCell>
            <TableCell>
              <Input
                value={student.name}
                onChange={(e) => handleInputChange(index, 'name', e.target.value)}
              />
            </TableCell>
            <TableCell>
              <Input
                value={student.email}
                onChange={(e) => handleInputChange(index, 'email', e.target.value)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default StudentImportTable;