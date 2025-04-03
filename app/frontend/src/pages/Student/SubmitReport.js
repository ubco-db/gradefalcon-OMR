import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "../../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { ArrowUpRightIcon, ChevronLeftIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { TooltipProvider } from "../../components/ui/tooltip";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../../components/ui/select";
import { useToast } from "../../components/ui/use-toast";
import { Toaster } from "../../components/ui/toaster";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { AnswerGrid } from "../../components/AnswerGrid";

const SubmitReport = () => {
  const navigate = useNavigate();
  const { getAccessTokenSilently } = useAuth0();
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [grade, setGrade] = useState("");
  const [reportText, setReportText] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [frontSrc, setFrontSrc] = useState("");
  const [backSrc, setBackSrc] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [error, setError] = useState("");
  const [studentReports, setStudentReports] = useState([]);
  const [ answers, setAnswers ] = useState([]);
  const [ studentAnswers, setStudentAnswers ] = useState([]);
  const { toast } = useToast();
  const [ showFrontImg, setShowFrontImg] = useState(true);

  useEffect(() => {
    const fetchExamsAndReports = async () => {
      try {
        const token = await getAccessTokenSilently();

        // Fetch the exams
        const examsResponse = await fetch(`/api/exam/student/exams`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (examsResponse.ok) {
          const data = await examsResponse.json();
          setExams(data.exams);
        } else {
          console.error("Failed to fetch exams");
        }

        // Fetch the reports
        const reportsResponse = await fetch(`/api/reports/student-reports`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });
        if (reportsResponse.ok) {
          const reportData = await reportsResponse.json();
          setStudentReports(reportData);
        } else {
          console.error("Failed to fetch student reports");
        }
      } catch (err) {
        console.error("Error fetching exams or reports:", err);
      }
    };

    fetchExamsAndReports();
  }, [getAccessTokenSilently]);

  const base64ToBlob = (base64) => {
    const byteString = atob(base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: 'image/png' });
  };

  const handleExamChange = async (value) => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`/api/exam/getStudentAttempt/${value}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedExam(data.exam); // exam_id, student_id, grade, chosen_answers, exam_title, total_marks, course_id, course_name, viewing_options
        setGrade(data.exam.grade);
        setTotalMarks(data.exam.total_marks);
        setStudentAnswers(data.exam.chosen_answers);
        
        const fetchSolution = async (examId) => {
          try {
            const token = await getAccessTokenSilently();
            const response = await fetch(`/api/exam/fetchSolutionAnswers/${examId}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
            });
            if (response.ok) {
              const data = await response.json();
              setAnswers(data);
            } else {
              console.error("Failed to fetch answers");
            }
          } catch (err) {
            console.error("Error fetching answers:", err);
          }
        };
        fetchSolution(data.exam.exam_id);
        
        const imageResponse = await fetch(`/api/images/exam/${value}/student/${data.exam.student_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          if (!imageData.images) {
            console.error("No images found in response");
            return;
          }
          
          const { images } = imageData;
          
          if (images.page1 && images.page1.results) {
            const frontImage = base64ToBlob(images.page1.results);
            setFrontSrc(URL.createObjectURL(frontImage));
          } else {
            setFrontSrc(null);
          }
          
          if (images.page2 && images.page2.results) {
            const backImage = base64ToBlob(images.page2.results);
            setBackSrc(URL.createObjectURL(backImage));
          } else {
            setBackSrc(null);
          }
        } else {
          console.error("Failed to fetch exam images");
          setFrontSrc(null);
          setBackSrc(null);
        }
      } else {
        console.error("Failed to fetch exam details");
      }
    } catch (error) {
      console.error("Error fetching exam details or images:", error);
    }
  };

  return (
    <>
      <main className="flex flex-col gap-4 p-2">
        <div className="w-full mx-auto grid flex-1 auto-rows-max gap-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={() => window.history.back()}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-2xl font-semibold">Make a Report</h1>
          </div>

          {showAlert && (
            <div className="w-full flex justify-center">
              <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-1 max-w-2xl">
                <Alert className="mb-4">
                  <ExclamationCircleIcon className="h-4 w-4" />
                  <AlertTitle>Heads up!</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            </div>
          )}

          <div className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-12">
            <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-2 lg:col-span-5">
              <div className="grid auto-rows-max items-start gap-8">
                <Card className="bg-white border rounded-lg p-6 w-full">
                  <CardHeader>
                    <CardTitle>Select Exam</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <Label htmlFor="exam">Exam</Label>
                      <Select onValueChange={handleExamChange}>
                        <SelectTrigger id="exam" aria-label="Select exam">
                          <SelectValue placeholder="Select exam" />
                        </SelectTrigger>
                        <SelectContent>
                          {exams.map((exam) => (
                            <SelectItem key={exam.exam_id} value={exam.exam_id}>
                              {exam.exam_title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                  <CardContent>
                    <div className="grid gap-6 mt-4">
                      <div className="grid gap-3">
                        <Label htmlFor="grade">Grade</Label>
                        <Label id="grade">{grade} /<span className="text-gray-500">{totalMarks}</span></Label>  {/* */}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {selectedExam && (
                  <div className="flex-grow flex flex-col">
                    <AnswerGrid
                        totalQuestions={answers?.length}
                        correctAnswers={answers}
                        studentAnswers={studentAnswers}
                        appealing={true}
                        examId={selectedExam.exam_id}
                        studentId={selectedExam.student_id}
                      onSuccessAppealSubmit={(ifSuccess, message) => {
                          setSelectedExam(null);
                          ifSuccess? (() => {toast({
                            // TODO longsai: use a unified notification service with toast
                            // along with the predefined templates such as info, warning, error with styles and durations
                            title: "Submission successs",
                            description: "Successful submitted the grade appeal",
                            duration: 1000,
                          })})() : (() => {
                            toast({
                              title: "Submission error",
                              description: message,
                              variant:"destructive"
                            })
                          })()
                          }}/>
                  </div>
                )}

              </div>
            </div>

            {selectedExam && (
              <div className="relative flex h-full min-h-[50vh] flex-col rounded-xl bg-muted/50 p-4 lg:col-span-7">
                <Badge variant="outline" className="absolute right-3 top-3">
                  Exam
                </Badge>
                <div className="flex gap-4 mb-4">
                  <Button onClick={() => setShowFrontImg(!showFrontImg)}>Toggle Front/Back</Button>
                </div>

                  <div className="flex flex-wrap justify-center gap-4">
                {showFrontImg && frontSrc ? (
                  <img
                    src={frontSrc}
                    alt="Student Exam Front Page"
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                    }}
                  />
                ) : showFrontImg && (
                  <p>No front image found</p>
                )}
                {!showFrontImg && backSrc ? (
                  <img
                    src={backSrc}
                    alt="Student Exam Back Page"
                    style={{
                      maxWidth: "100%",
                      height: "auto",
                    }}
                  />
                ) : !showFrontImg && (
                  <p>No back image found</p>
                )}
              </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default SubmitReport;
