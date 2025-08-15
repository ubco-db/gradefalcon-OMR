import React, { useEffect, useState, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../../components/ui/tooltip";
import { EyeIcon, TrashIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { useToast } from "../../components/ui/use-toast";
import { Toaster } from "../../components/ui/toaster";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import "../../css/App.css";

const ReviewExams = () => {
  const { getAccessTokenSilently } = useAuth0();
  const location = useLocation();
  const [studentScores, setStudentScores] = useState([]);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [registeredStudents, setRegisteredStudents] = useState([]);
  const [totalMarks, setTotalMarks] = useState();
  const [editStudentId, setEditStudentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [resultsCombined, setResultsCombined] = useState(false);
  const { exam_id, examType, numQuestions } = location.state || {};
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duplicateIds, setDuplicateIds] = useState(new Set());
  const [notFoundIds, setNotFoundIds] = useState(new Set());
  const [deletingIndex, setDeletingIndex] = useState(null);
  const [searchTerms, setSearchTerms] = useState({}); // Track search terms for each dropdown
  const searchInputRefs = useRef({}); // Refs for search inputs


  // Save current state to localStorage
  const saveStateToStorage = (data) => {
    try {
      localStorage.setItem(`exam_${exam_id}_scores`, JSON.stringify(data));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  };

  // Get saved state from localStorage
  const getStateFromStorage = () => {
    try {
      const savedData = localStorage.getItem(`exam_${exam_id}_scores`);
      return savedData ? JSON.parse(savedData) : null;
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      return null;
    }
  };

  // Fetch student scores for the exam DIRECTLY from omr, 
  // for when  reveiwing the exam
  const fetchStudentScores = async () => {
    const token = await getAccessTokenSilently();
    const response = await fetch(`/api/exam/studentScores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ exam_id }), // Send examType, numQuestions and exam_id in the request body
    });
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const data = await response.json();
    
    // Check for saved state before setting data
    const savedState = getStateFromStorage();
    if (savedState && !initialDataLoaded) {
      console.log("Using saved state from localStorage");
      setStudentScores(savedState);
    } else {
      setStudentScores(data);
    }
    
    setInitialDataLoaded(true);
  };

  const fetchRegisteredStudents = async () => {
    const token = await getAccessTokenSilently();
    const response = await fetch(`/api/exam/students/${exam_id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      }
    });
    if (!response.ok) {
      throw new Error("Failed to fetch registered students");
    }
    const data = await response.json();
    console.log("Registered students data:", data);
    setRegisteredStudents(data.students);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchTotalScore = async () => {
          const token = await getAccessTokenSilently();
          const response = await fetch(`/api/exam/getScoreByExamId/${exam_id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!response.ok) {
            throw new Error("Failed to fetch total score");
          }
          console.log("exam_id", exam_id);
          const data = await response.json();
          console.log("totalMarks", data);
          setTotalMarks(data.scores[0]);
        };

        await fetchStudentScores();
        await fetchRegisteredStudents();
        await fetchTotalScore();

        setResultsCombined(true);
      } catch (error) {
        console.error("Error:", error);
      }
    };

    fetchData();
  }, [getAccessTokenSilently, exam_id, examType, numQuestions]);

  // Save to localStorage whenever studentScores changes
  useEffect(() => {
    if (initialDataLoaded && studentScores.length > 0) {
      saveStateToStorage(studentScores);
    }
  }, [studentScores, initialDataLoaded]);

  // Check for duplicate and not found student IDs
  useEffect(() => {
    // Calculate how many times each student ID is selected
    const idCounts = {};
    studentScores.forEach(student => {
      if (student.StudentID) {
        idCounts[student.StudentID] = (idCounts[student.StudentID] || 0) + 1;
      }
    });
    
    // Find duplicate IDs
    const duplicates = new Set();
    Object.entries(idCounts).forEach(([id, count]) => {
      if (count > 1) {
        duplicates.add(id);
      }
    });
    
    // Find IDs not in registered students list
    const notFound = new Set();
    const registeredIds = new Set(registeredStudents.map(s => s.student_id));
    studentScores.forEach(student => {
      if (student.StudentID && !registeredIds.has(student.StudentID)) {
        notFound.add(student.StudentID);
      }
    });
    
    setDuplicateIds(duplicates);
    setNotFoundIds(notFound);
  }, [studentScores, registeredStudents]);

  const getStudentOptions = (index, searchTerm = "") => {
    // Get StudentIDs assigned to other rows (exclude from options)
    const usedInOtherRows = new Set();
    studentScores.forEach((student, idx) => {
      if (idx !== index && student.StudentID) {
        usedInOtherRows.add(student.StudentID);
      }
    });
    
    // Build student options from registered students
    let students = registeredStudents.map(student => ({
      value: student.student_id,
      label: `${student.name} (${student.student_id})`
    }));
    
    // Include current student ID if not in registered list
    const currentStudentId = studentScores[index]?.StudentID;
    if (currentStudentId && !students.some(s => s.value === currentStudentId)) {
      students.push({
        value: currentStudentId,
        label: `Unknown student (${currentStudentId})`
      });
    }
    
    // Filter out students assigned to other rows
    students = students.filter(student => 
      student.value === currentStudentId || !usedInOtherRows.has(student.value)
    );
    
    // Apply search filter if provided
    if (searchTerm) {
      students = students.filter(student =>
        student.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.value.toString().includes(searchTerm)
      );
    }
    
    return students.sort((a, b) => a.label.localeCompare(b.label));
  };

  const handleViewClick = (studentId, student_name, grade, chosen_answers, image_uuids, has_multiple_answers) => {
    // Save current state before navigating
    saveStateToStorage(studentScores);
    
    navigate("/ViewExam", {
      state: {
        student_id: studentId,
        exam_id: exam_id,
        student_name: student_name,
        grade: grade,
        total_marks: totalMarks,
        reviewExams: true,
        chosen_answers: chosen_answers,
        image_uuids: image_uuids, // Pass the image UUIDs to ViewExam.js
        has_multiple_answers: has_multiple_answers, // Pass the multiple answers information
      },
    });
  };

  const handleScoreChange = (e, index) => {
    const newScore = e.target.value;
    setStudentScores((currentScores) => {
      const newScores = [...currentScores];
      newScores[index] = { ...newScores[index], Score: newScore };
      return newScores;
    });
  };

  const handleStudentIdChange = (newStudentId, index) => {
    setStudentScores((currentScores) => {
      const newScores = [...currentScores];
      
      const selectedStudent = registeredStudents.find(s => s.student_id === newStudentId);
      const studentName = selectedStudent ? selectedStudent.name : "Unknown student";
      
      newScores[index] = { 
        ...newScores[index], 
        StudentID: newStudentId,
        StudentName: studentName
      };
      return newScores;
    });
  };

  
  const handleDeleteRow = (index) => {
    setDeletingIndex(index);
    
    // Confirmation before deletion
    const confirmDelete = window.confirm("Are you sure you want to delete this exam record?");
    if (confirmDelete) {
      setStudentScores(currentScores => {
        const newScores = [...currentScores];
        newScores.splice(index, 1);
        return newScores;
      });
      
      toast({
        title: "Exam record deleted",
        description: "The exam record has been removed from the list",
      });
    }
    
    setDeletingIndex(null);
  };

  const saveResults = async () => {
    try {
      // Check for invalid entries
      if (duplicateIds.size > 0 || notFoundIds.size > 0) {
        const duplicateList = Array.from(duplicateIds).join(", ");
        const notFoundList = Array.from(notFoundIds).join(", ");
        
        let errorMessage = "Cannot save results due to the following issues:";
        if (duplicateIds.size > 0) {
          errorMessage += `\n- Duplicate Student IDs: ${duplicateList}`;
        }
        if (notFoundIds.size > 0) {
          errorMessage += `\n- Unregistered Student IDs: ${notFoundList}`;
        }
        
        alert(errorMessage);
        return;
      }
      
      // If everything is valid, confirm before saving
      const confirmSave = window.confirm("Are you sure you want to save these results?");
      if (!confirmSave) return;
      
      const token = await getAccessTokenSilently();
      
      const formattedScores = studentScores.map(student => ({
        ...student,
        Score: student.Score?.toString() || "0"
      }));
      
      const response = await fetch("/api/exam/saveResults", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          studentScores: formattedScores, 
          exam_id,
          examType,
          numQuestions
        }),
      });
      
      if (!response.ok) {
        throw new Error("save results Network response was not ok");
      }
      
      toast({
        title: "Results saved! Redirecting...",
      });
      
      // Clear saved state after successful save
      localStorage.removeItem(`exam_${exam_id}_scores`);
      
      setTimeout(() => {
        navigate("/Examboard");
      }, 2000);
    } catch (error) {
      console.error("Error saving results:", error);
    }
  };

  const filteredScores = searchQuery
    ? studentScores.filter((student) => 
        student.StudentID.toString().includes(searchQuery) || 
        (student.StudentName && student.StudentName.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : studentScores;

  // Check if student has multiple answers
  const hasMultipleAnswers = (student) => {
    return student.has_multiple_answers && student.has_multiple_answers.length > 0;
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <div className="flex justify-between items-center w-full mb-4">
        <h1 className="text-2xl font-semibold">Review Exams</h1>
        <Input
          type="text"
          placeholder="Search by Student ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>
      <div className="w-full">
        <Card className="bg-white border rounded">
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Score/ {totalMarks}</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScores.map((student, index) => (
                  <TableRow 
                    key={index}
                    className={hasMultipleAnswers(student) ? "bg-yellow-50" : ""}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {student.StudentName}
                        {hasMultipleAnswers(student) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-400">
                                  <ExclamationCircleIcon className="h-3.5 w-3.5 mr-1" />
                                  Multiple Answers to MCQs
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>This student has selected multiple answers for {student.has_multiple_answers.length} question(s)</p>
                                <p className="text-xs mt-1">Affected questions: {student.has_multiple_answers.join(", ")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`${duplicateIds.has(student.StudentID) || notFoundIds.has(student.StudentID) ? 'border-2 border-red-500 rounded p-1' : ''}`}>
                        <Select value={student.StudentID} onValueChange={(value) => handleStudentIdChange(value, index)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select student..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto z-50">
                            <div className="flex items-center px-3 pb-2">
                              <Input
                                ref={(el) => {
                                  searchInputRefs.current[index] = el;
                                }}
                                placeholder="Search students..."
                                className="h-8"
                                value={searchTerms[index] || ""}
                                onChange={(e) => {
                                  setSearchTerms(prev => ({
                                    ...prev,
                                    [index]: e.target.value
                                  }));
                                  // Maintain focus after state update
                                  setTimeout(() => {
                                    searchInputRefs.current[index]?.focus();
                                  }, 0);
                                }}
                                autoFocus
                              />
                            </div>
                            {getStudentOptions(index, searchTerms[index]).map((studentOption) => (
                              <SelectItem key={studentOption.value} value={studentOption.value}>
                                {studentOption.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {duplicateIds.has(student.StudentID) && (
                          <div className="text-xs text-red-500 mt-1">Duplicate student ID</div>
                        )}
                        {notFoundIds.has(student.StudentID) && (
                          <div className="text-xs text-red-500 mt-1">Unregistered student ID</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={student.Score}
                        max={totalMarks}
                        min="0"
                        onChange={(e) => handleScoreChange(e, index)}
                        className="w-16 px-2 py-1"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="flex items-center justify-center hover:text-primary"
                          onClick={() =>
                            handleViewClick(
                              student.StudentID, 
                              student.StudentName, 
                              student.Score, 
                              student.chosen_answers, 
                              student.image_uuids,
                              student.has_multiple_answers
                            )
                          }
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="flex items-center justify-center hover:text-red-500"
                          onClick={() => handleDeleteRow(index)}
                          disabled={deletingIndex === index}
                        >
                          <TrashIcon className="h-5 w-5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Button onClick={saveResults} className="mt-4 self-end">
        Save Results
      </Button>
    </main>
  );
};

export default ReviewExams;
