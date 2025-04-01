import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../css/App.css";
import ExamViewDialog from "../../components/ExamViewDialog";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";
import { Button } from "../../components/ui/button";
import { useAuth0 } from "@auth0/auth0-react";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useToast } from "../../components/ui/use-toast";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import GradeRadialChart from "../../components/GradeRadialChart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { AnswerGrid } from "../../components/AnswerGrid";

const ViewExam = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const location = useLocation();
  const navigate = useNavigate();
  let {
    student_id,
    exam_id,
    front_page,
    back_page,
    original_front_page,
    original_back_page,
    student_name,
    grade,
    total_marks,
    reviewExams,
    answers,
    total_questions,
    chosen_answers,
    image_uuids
  } = location.state || {};
  const [frontSrc, setFrontSrc] = useState("");
  const [backSrc, setBackSrc] = useState("");
  const [originalBack, setOriginalBack] = useState("");
  const [originalFront, setOriginalFront] = useState("");
  const [editableGrade, setEditableGrade] = useState(grade);
  const [displayGrade, setDisplayGrade] = useState(grade);
  const [error, setError] = useState("");
  const [gradeChangelog, setGradeChangelog] = useState([]);

  console.log("displayGrade", displayGrade);
  console.log("Debug Data:", {
    total_questions,
    grade,
    student_name,
    answers,
    chosen_answers,
    image_uuids,
    reviewExams,
    exam_id,
    student_id
  });

  useEffect(() => {
    const fetchExam = async () => {
      // Check for required parameters
      if (!student_id || !exam_id) {
        console.log("Student ID or Exam ID is missing");
        return;
      }

      try {
        const token = await getAccessTokenSilently();
        
        // Check if image_uuids were passed directly from ReviewExams or ExamDetails
        // If image_uuids is passed directly, use it regardless of source
        if (location.state && location.state.image_uuids) {
          console.log("Using image_uuids passed from parent component");
          // Use the passed image_uuids directly if available
          await processImageUuids(token);
        } else {
          // Otherwise, fetch all exam images from the image service API
          console.log("Fetching images from image service API");
          const response = await fetch(`/api/images/exam/${exam_id}/student/${student_id}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch images: ${response.status}`);
          }

          const data = await response.json();
          
          // Check if we have images data
          if (!data.images) {
            console.error("No images found in response");
            return;
          }

          const { images } = data;
          
          // Process front page (page1) images
          if (images.page1) {
            // Results (marked) image
            if (images.page1.results) {
              const frontImgBlob = base64ToBlob(images.page1.results);
              setFrontSrc(URL.createObjectURL(frontImgBlob));
            }
            
            // Original image
            if (images.page1.original) {
              const originalFrontImgBlob = base64ToBlob(images.page1.original);
              setOriginalFront(URL.createObjectURL(originalFrontImgBlob));
            }
          }

          // Process back page (page2) images
          if (images.page2) {
            // Results (marked) image
            if (images.page2.results) {
              const backImgBlob = base64ToBlob(images.page2.results);
              setBackSrc(URL.createObjectURL(backImgBlob));
            }
            
            // Original image
            if (images.page2.original) {
              const originalBackImgBlob = base64ToBlob(images.page2.original);
              setOriginalBack(URL.createObjectURL(originalBackImgBlob));
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch exam images:", error);
      }
    };

    // Process image_uuids passed from ReviewExams or ExamDetails
    const processImageUuids = async (token) => {
      if (!location.state || !location.state.image_uuids) {
        console.log("No image_uuids provided from calling component");
        return;
      }
      
      const image_uuids = location.state.image_uuids;
      console.log("Processing image UUIDs:", image_uuids);

      try {
        // Fetch each image individually using the image service API
        const fetchImage = async (uuid) => {
          if (!uuid) return null;
          
          const response = await fetch(`/api/images/${uuid}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          
          if (!response.ok) {
            throw new Error(`Failed to fetch image ${uuid}: ${response.status}`);
          }
          
          const data = await response.json();
          return data.image;
        };
        
        // Process page1 (front) images
        if (image_uuids.page1) {
          // Results (marked) image
          if (image_uuids.page1.results) {
            const frontImg = await fetchImage(image_uuids.page1.results);
            if (frontImg) {
              const frontImgBlob = base64ToBlob(frontImg);
              setFrontSrc(URL.createObjectURL(frontImgBlob));
            }
          }
          
          // Original image
          if (image_uuids.page1.original) {
            const originalFrontImg = await fetchImage(image_uuids.page1.original);
            if (originalFrontImg) {
              const originalFrontImgBlob = base64ToBlob(originalFrontImg);
              setOriginalFront(URL.createObjectURL(originalFrontImgBlob));
            }
          }
        }
        
        // Process page2 (back) images
        if (image_uuids.page2) {
          // Results (marked) image
          if (image_uuids.page2.results) {
            const backImg = await fetchImage(image_uuids.page2.results);
            if (backImg) {
              const backImgBlob = base64ToBlob(backImg);
              setBackSrc(URL.createObjectURL(backImgBlob));
            }
          }
          
          // Original image
          if (image_uuids.page2.original) {
            const originalBackImg = await fetchImage(image_uuids.page2.original);
            if (originalBackImg) {
              const originalBackImgBlob = base64ToBlob(originalBackImg);
              setOriginalBack(URL.createObjectURL(originalBackImgBlob));
            }
          }
        }
      } catch (error) {
        console.error("Failed to process image UUIDs:", error);
      }
    };

    fetchExam();
    fetchChangelog();
  }, [student_id, exam_id, getAccessTokenSilently, isAuthenticated, reviewExams, location.state]);
  
  // Helper function to convert base64 to Blob
  const base64ToBlob = (base64) => {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: 'image/png' });
  };

  const fetchChangelog = async () => {
    const token = await getAccessTokenSilently();
    const response = await fetch("/api/exam/fetchChangelog", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ student_id: student_id, exam_id: exam_id }),
    });
    const data = await response.json();
    setGradeChangelog(data.grade_changelog);
    console.log("Changelog:", data);
  };

  const handleSave = async () => {
    if (editableGrade < 0 || editableGrade > total_marks) {
      setError(`Grade must be between 0 and ${total_marks}`);
      return;
    }

    const token = await getAccessTokenSilently();
    const response = await fetch("/api/exam/changeGrade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ student_id: student_id, exam_id: exam_id, grade: editableGrade }),
    });
    const data = await response.json();
    console.log("Data:", data);
    console.log("Saved grade:", editableGrade);
    setDisplayGrade(editableGrade);

    fetchChangelog();
  };

  return (
    <main className="flex flex-col gap-4 p-2">
    <div className="w-full mx-auto flex items-center gap-8">
      <Button
        variant="outline"
        size="icon"
        className="h-10 w-10"
        onClick={() => window.history.back()}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <span className="sr-only">Back</span>
      </Button>
      <h1 className="flex-1 text-3xl font-semibold tracking-tight">View Exam</h1>
      <div className="flex items-center gap-2 ml-auto">
        {/* Additional buttons or controls */}
      </div>
    </div>
  
    <div className="flex flex-col gap-8 w-full">
      {/* Student Details */}
      <div className="flex flex-row gap-8 w-full">
        <Card className="bg-white border rounded-lg p-6 w-full md:w-1/3">
          <CardHeader className="flex justify-between px-6 py-4">
            <CardTitle>Student Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="font-bold">Name</p>
              <p>{student_name}</p>
            </div>
            <div className="mb-4">
              <p className="font-bold">ID</p>
              <p>{student_id}</p>
            </div>
            <div>
              <p className="font-bold">Grade</p>
            </div>
            <GradeRadialChart grade={displayGrade} totalMarks={total_marks} />
          </CardContent>
        </Card>
  
        <div className="flex flex-col w-full md:w-2/3 gap-8">
          {/* Edit Grade */}
        <Card className="bg-white border rounded-lg p-6">
            <CardHeader className="flex justify-between px-4 py-4">
              <CardTitle>Edit Grade</CardTitle>
            </CardHeader>
            <CardContent>
              {!reviewExams && (
                <AlertDialog>
                  <AlertDialogTrigger>
                    <Button variant="default">Change score</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Changing grade</AlertDialogTitle>
                      <AlertDialogDescription>
                        You are now changing the grade for {student_name} with ID: {student_id}. This will be recorded.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      type="number"
                      value={editableGrade}
                      onChange={(e) => setEditableGrade(e.target.value)}
                      min={0}
                      max={total_marks}
                    />
                    {error && <p style={{ color: "red" }}>{error}</p>}
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSave}>Save</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="mt-4 flex gap-2">
                <ExamViewDialog frontSrc={frontSrc} backSrc={backSrc} buttonText={"View Scanned Exams"} />
                <ExamViewDialog frontSrc={originalFront} backSrc={originalBack} buttonText={"View Original Exams"} />
              </div>
            </CardContent>
          </Card>
        {/* Grade Changelog and Edit Grade stacked */}
          <Card className="bg-white border rounded-lg p-6">
            <CardHeader className="flex justify-between px-6 py-4">
              <CardTitle>Grade Changelog</CardTitle>
            </CardHeader>
            <CardContent>
              {gradeChangelog && gradeChangelog.length === 0 ? (
                <p>No changes to this grade have been made</p>
              ) : (
                gradeChangelog && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Changelog</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gradeChangelog.map((log, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Badge variant="secondary" className="text-base">
                              {log}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              )}
            </CardContent>
          </Card>
          <AnswerGrid 
              totalQuestions={total_questions}
              correctAnswers={answers}
              studentAnswers={chosen_answers}
            />
        </div>
      </div>
    </div>
  </main>  
  );
};

export default ViewExam;
