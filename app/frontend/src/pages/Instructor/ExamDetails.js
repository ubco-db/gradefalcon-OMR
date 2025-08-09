import { useAuth0 } from "@auth0/auth0-react";
import { ChevronLeftIcon, TableCellsIcon } from "@heroicons/react/20/solid";
import { BarChartIcon, DownloadIcon, FileIcon } from "lucide-react";
import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useNavigate, useParams } from "react-router-dom";
import useExamApi from "../../api/useExamApi";
import { ExamGridAppealView } from "../../components/ExamGridAppealView";
import LmsAssignmentManager from "../../components/LmsAssignmentManager";
import QuestionsTable from "../../components/QuestionsTable";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../../components/ui/drawer";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { toast } from "../../components/ui/use-toast";
import "../../css/App.css";

const ExamDetails = () => {
  const { getAccessTokenSilently } = useAuth0();
  const { exam_id } = useParams();
  const [examData, setExamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState([]);
  const { exportScannedResults: exportExamScannedResultsApi,
    fetchExamDetails: fetchExamDetailsApi } = useExamApi();

  const navigate = useNavigate();

  useEffect(() => {
    const fetchExamData = async () => {
      try {
        // Fetch exam details
        const examResponse = await fetchExamDetailsApi(exam_id)
        if (!examResponse.success) {
          toast({
            title: "Error: fetch Exam Details",
            description: examResponse.error || "Failed to fetch exam details.",
            variant: "destructive"
          })
          setError("Failed to fetch exam details.");
        } else {
          setExamData(examResponse.data);
          
          // Handle both old format (array) and new format (object with mcq/parsons)
          const rawAnswers = examResponse.data.answers;
          let processedAnswers = [];
          
          if (Array.isArray(rawAnswers)) {
            // Old format - direct array
            processedAnswers = rawAnswers;
          } else if (rawAnswers && typeof rawAnswers === 'object' && rawAnswers.mcq) {
            // New format - object with mcq property
            processedAnswers = rawAnswers.mcq || [];
          }
          
          setAnswers(processedAnswers);
          console.log("Exam Data:", examResponse.data);
          console.log("Processed Answers:", processedAnswers);
        }
      } catch (error) {
        setError("Error fetching exam data");
      } finally {
        setLoading(false);
      }
    };

    fetchExamData();
  }, [exam_id, getAccessTokenSilently]);

  const exportToCSV = () => {
    let csvContent = "Student ID,Student Name,Grade\r\n";
    examData.studentResults.forEach((result) => {
      csvContent += `${result.student_id},${result.student_name},${result.grade}\r\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    if (link.download !== undefined) {
      link.setAttribute("href", url);
      link.setAttribute("download", `${examData.exam_title}_results.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const exportScannedResults = async () => {
    const result = await exportExamScannedResultsApi(exam_id);
    if (!result.success) {
      toast({
        title: "Error",
        description: result.error || "Failed to export scanned results.",
        duration: 3000,
      })
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  // // Safeguard against undefined or null questionStats
  // const questionStats = examData.questionStats ? examData.questionStats : {};

  // Log questionStats
  console.log("Question Stats:", examData.questionStats);

  const grades = examData.studentResults.map((result) => result.grade);
  const primaryColor = "#0a8537";
  const minGrade = Math.min(...grades);
  const maxGrade = Math.max(...grades);
  const meanGrade = (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2);

  const layout = {
    width: '50%',
    height: 400,
    paper_bgcolor: 'rgba(0,0,0,0)',  // Transparent background
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: {
      l: 100,
      r: 100,
      b: 70,
      t: 100,
      pad: 4,
    },
    showlegend: false,
    xaxis: {
      title: "Grades",
      zeroline: false,
      tickfont: {
        family: "var(--font-body)", // Use the Inter font defined in your layout
        size: 12,
        color: "hsl(var(--foreground))",
      },
    },
    shapes: [
      // Min, Max, and Mean lines
      {
        type: "line",
        y0: 0,
        y1: 1,
        yref: "paper",
        x0: minGrade,
        x1: minGrade,
        line: {
          color: primaryColor,
          width: 2,
          dash: "dot",
        },
      },
      {
        type: "line",
        y0: 0,
        y1: 1,
        yref: "paper",
        x0: maxGrade,
        x1: maxGrade,
        line: {
          color: primaryColor,
          width: 2,
          dash: "dot",
        },
      },
      {
        type: "line",
        y0: 0,
        y1: 1,
        yref: "paper",
        x0: meanGrade,
        x1: meanGrade,
        line: {
          color: primaryColor,
          width: 2,
          dash: "dot",
        },
      },
    ],
    annotations: [
      {
        y: 1,
        x: minGrade,
        yref: "paper",
        xref: "x",
        text: `Min: ${minGrade}`,
        showarrow: true,
        arrowhead: 7,
        ax: 0,
        ay: -40,
        textangle: 0,
        font: {
          family: "var(--font-body)",
          size: 12,
          color: "hsl(var(--foreground))",
        },
      },
      {
        y: 1,
        x: maxGrade,
        yref: "paper",
        xref: "x",
        text: `Max: ${maxGrade}`,
        showarrow: true,
        arrowhead: 7,
        ax: 0,
        ay: -40,
        textangle: 0,
        font: {
          family: "var(--font-body)",
          size: 12,
          color: "hsl(var(--foreground))",
        },
      },
      {
        y: 1,
        x: meanGrade,
        yref: "paper",
        xref: "x",
        text: `Mean: ${meanGrade}`,
        showarrow: true,
        arrowhead: 7,
        ax: 0,
        ay: -40,
        textangle: 0,
        font: {
          family: "var(--font-body)",
          size: 12,
          color: "hsl(var(--foreground))",
        },
      },
    ],
  };

  const data = [
    {
      x: grades,
      type: "box",
      boxpoints: "all",
      jitter: 0.3,
      pointpos: -1.8,
      marker: {
        color: primaryColor,
      },
      line: {
        shape: "spline",  // Use spline to make the lines smoother (if supported)
        color: primaryColor,
        width: 3,  // Thicker border for better visibility
      },
      fillcolor: "rgba(10, 133, 55, 0.8)",  // Fill the inside of the box plot with the primary color
      boxmean: true,  // Display the mean
      meanline: {
        color: primaryColor,
        width: 2,
      },
      whiskerwidth: 0,  // Hide whiskers (upper and lower fences)
      hoverinfo: "x",
    },
  ];



  return (
    <div className="mx-auto grid max-w-[70rem] flex-1 auto-rows-max gap-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => window.history.back()}>
          <ChevronLeftIcon className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </Button>
        <h1 className="flex-1 shrink-0 whitespace-nowrap text-xl font-semibold tracking-tight sm:grow-0">
          {examData.exam_title}
        </h1>
        <div className="flex items-center gap-2 ml-auto">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={exportToCSV}>
                  <FileIcon className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Export CSV</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export results as a CSV file.</TooltipContent>
            </Tooltip>

            {/* Export Scanned Results Button */}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={exportScannedResults}>
                  <DownloadIcon className="h-4 w-4" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Export Scans</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export scanned PDFs in a ZIP.</TooltipContent>
            </Tooltip>

            {/* Drawer for Box Plot */}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-8 gap-1 text-white" style={{ backgroundColor: "hsl(var(--primary))" }}>
                  <Drawer>
                    <DrawerTrigger asChild>
                      <BarChartIcon className="h-4 w-4" />
                    </DrawerTrigger>
                    <DrawerContent>
                      <div className="mx-auto w-full max-w-lg">
                        <DrawerHeader>
                          <DrawerTitle>Box Plot Analysis</DrawerTitle>
                          <DrawerDescription>View the box plot analysis of the exam results.</DrawerDescription>
                        </DrawerHeader>
                        <Card>
                          <CardContent className="flex aspect-square items-center justify-center p-3">
                            <Plot
                              data={data}
                              layout={layout}
                              config={{
                                responsive: true, // Make the plot responsive
                                displayModeBar: false,
                              }}
                            />
                          </CardContent>
                        </Card>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <Button variant="outline">Close</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </div>
                    </DrawerContent>
                  </Drawer>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Box Plot</TooltipContent>
            </Tooltip>

            {/* Drawer for Question Stats */}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-8 gap-1 text-white" style={{ backgroundColor: "hsl(var(--primary))" }}>
                  <Drawer>
                    <DrawerTrigger asChild>
                      <TableCellsIcon className="h-4 w-4" />
                    </DrawerTrigger>
                    <DrawerContent style={{ height: '90vh' }}>
                      <DrawerHeader>
                        <DrawerTitle>Question Statistics</DrawerTitle>
                        <DrawerDescription>View the response distribution by question.</DrawerDescription>
                      </DrawerHeader>
                      <QuestionsTable questionStats={examData.questionStats} />
                      <DrawerFooter>
                        <DrawerClose asChild>
                          <Button variant="outline">Close</Button>
                        </DrawerClose>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Question Distribution</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex space-x-4">
        {examData.studentResults.length > 0 ? (
          <Card className="bg-white border rounded w-1/2">
            <CardHeader className="flex justify-between px-6 py-4">
              <CardTitle className="mb-2">Student Grades</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {examData.studentResults.map((result) => (
                      <TooltipProvider key={result.student_id}>
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <TableRow
                              onClick={() => {
                                navigate(`/ViewExam`, {
                                  state: {
                                    student_id: result.student_id,
                                    exam_id: examData.exam_id,
                                    student_name: result.student_name,
                                    grade: result.grade,
                                    total_marks: examData.total_marks,
                                    chosen_answers: result.chosen_answers,
                                    answers: examData.answers,
                                    total_questions: examData.total_questions,
                                  },
                                });
                              }}
                              key={result.student_id}
                            >
                              <TableCell>{result.student_id}</TableCell>
                              <TableCell>{result.student_name}</TableCell>
                              <TableCell>{result.grade}/<span className="text-gray-500">{examData.total_marks}</span></TableCell>
                            </TableRow>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Click for details</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <div className="w-1/2 flex flex-col items-center justify-center bg-white border rounded p-4">
            <p>Exam not graded yet</p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                navigate(`/UploadExams/${examData.exam_id}`);
              }}
            >
              Grade Exam
            </Button>
          </div>
        )}

        <Card className="bg-white border rounded w-1/2">
          <CardHeader className="flex justify-between px-6 py-4">
            <CardTitle className="mb-2">Answer Key</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Answer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {answers.map((answerObj, index) => {
                    const question = Object.keys(answerObj)[0];
                    let questionLabel = question;
                    // Remove leading 'q' if present (e.g., 'q1' -> '1')
                    if (questionLabel.startsWith('q')) {
                      questionLabel = questionLabel.slice(1);
                    }
                    const answer = answerObj[question];
                    return (
                      <TableRow key={index}>
                        <TableCell>{questionLabel}</TableCell>
                        <TableCell>{answer}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      
      {/* LMS Integration Section */}
      <LmsAssignmentManager 
        examId={exam_id} 
        classId={examData.class_id} 
      />
      
      <ExamGridAppealView
        examId={exam_id}>
      </ExamGridAppealView>
    </div>
  );
};

export default ExamDetails;
