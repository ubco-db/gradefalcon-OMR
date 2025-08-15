import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import "../../css/App.css";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusCircleIcon,
  TrashIcon,
  PlusIcon,
  MinusIcon,
  ExclamationCircleIcon,
  QuestionMarkCircleIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/20/solid";
import { Label } from "../../components/ui/label";
import { Form } from "../../components/ui/form";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../../components/ui/table";
import { MultiSelect } from "../../components/ui/multi-select";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../../components/ui/tooltip";

const ManualExamKey = () => {
  const location = useLocation();
  const { examTitle, classID, courseId, template, numQuestions: initialNumQuestions, templateId, includeParsonsProblem, parsonsPositions, parsonsMaxScore } = location.state || {};  // Extract numQuestions and Parsons config
  
  console.log("ManualExamKey received Parsons config:", { includeParsonsProblem, parsonsPositions, parsonsMaxScore });
  const [numQuestions, setNumQuestions] = useState(initialNumQuestions || 10);
  const [numOptions, setNumOptions] = useState(5);
  const [mcqTotalMarks, setMcqTotalMarks] = useState();
  const [parsonsTotalMarks, setParsonsTotalMarks] = useState(10); // Default 10 marks, can be manually adjusted
  const [totalMarks, setTotalMarks] = useState();
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [markingSchemes, setMarkingSchemes] = useState([]);
  const [showCustomSchemeModal, setShowCustomSchemeModal] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [csvImportAlert, setCsvImportAlert] = useState({ show: false, message: "", type: "" });
  const fileInputRef = useRef(null);
  const [customScheme, setCustomScheme] = useState({
    questions: [],
    correct: 0,
    incorrect: 0,
    unmarked: 0,
  });
  const [parsonsAnswerKey, setParsonsAnswerKey] = useState([]);
  const parsonsInitializedRef = useRef(false);

  // Get questions that are already used in existing marking schemes
  const getUsedQuestions = () => {
    const usedQuestions = new Set();
    markingSchemes.forEach(scheme => {
      scheme.questions.forEach(question => {
        // Convert from 'q1' format to 'Question 1' format
        const questionNumber = question.replace('q', '');
        usedQuestions.add(`Question ${questionNumber}`);
      });
    });
    return usedQuestions;
  };

  // Generate available frameworks (exclude already used questions)
  const frameworks = Array.from({ length: numQuestions }, (_, j) => {
    const questionValue = `Question ${j + 1}`;
    const usedQuestions = getUsedQuestions();
    
    return {
      value: questionValue,
      label: `Q${j + 1}`,
      disabled: usedQuestions.has(questionValue), // Disable if already used
    };
  }).filter(option => !option.disabled); // Only show available questions

  const removeQuestion = (questionNumber, option) => {
    setSelectedOptions((prevOptions) =>
      prevOptions.filter(
        (question) => !question[`q${questionNumber}`]
      )
    );
  };

  const toggleSelection = (selection) => (event) => {
    event.target.classList.toggle("selected");
    if (event.target.classList.contains("selected")) {
      event.target.style.backgroundColor = "hsl(var(--primary))";
      event.target.style.color = "white";
      setSelectedOptions((prevOptions) => {
        // Check if this question already has an answer
        const questionKey = `q${selection.question}`;
        const existingIndex = prevOptions.findIndex(item => questionKey in item);
        
        if (existingIndex !== -1) {
          // Replace existing answer
          const newOptions = [...prevOptions];
          newOptions[existingIndex] = { [questionKey]: selection.option };
          return newOptions;
        } else {
          // Add new answer
          return [...prevOptions, { [questionKey]: selection.option }];
        }
      });
    } else {
      event.target.style.backgroundColor = "";
      event.target.style.color = "";
      
      setSelectedOptions((prevOptions) => {
        const questionKey = `q${selection.question}`;
        return prevOptions.filter(item => !(questionKey in item));
      });
    }
  };

  const updateQuestions = useCallback(() => {
    const bubbleGrid = document.querySelector(".bubble-grid");

    bubbleGrid.innerHTML = "";

    for (let i = 1; i <= numQuestions; i++) {
      const questionDiv = document.createElement("div");
      questionDiv.className = "question mb-4";
      questionDiv.innerHTML = `<span>${i})</span><div class="options flex space-x-2"></div>`;

      const optionsDiv = questionDiv.querySelector(".options");

      for (let j = 0; j < numOptions; j++) {
        const optionSpan = document.createElement("span");
        optionSpan.className = "option cursor-pointer px-2 py-1 border rounded";
        optionSpan.innerText = String.fromCharCode(65 + j);
        optionSpan.onclick = toggleSelection({
          question: i,
          option: optionSpan.innerText,
        });
        
        // Check if this option is selected and apply styles
        const questionKey = `q${i}`;
        const isSelected = selectedOptions.some(item => 
          item[questionKey] === optionSpan.innerText
        );
        
        if (isSelected) {
          optionSpan.classList.add("selected");
          optionSpan.style.backgroundColor = "hsl(var(--primary))";
          optionSpan.style.color = "white";
        }

        optionsDiv.appendChild(optionSpan);
      }

      bubbleGrid.appendChild(questionDiv);
    }
  }, [numQuestions, numOptions, selectedOptions]);

  // Calculate MCQ total marks from custom marking schemes
  const calculateMcqTotalFromSchemes = () => {
    if (markingSchemes.length === 0) {
      return numQuestions; // Default: 1 mark per question
    }
    
    let totalFromSchemes = 0;
    const questionsInSchemes = new Set();
    
    // Add marks from custom schemes
    markingSchemes.forEach(scheme => {
      scheme.questions.forEach(question => {
        questionsInSchemes.add(question);
        totalFromSchemes += scheme.correct; // Use the 'correct' value as the max marks for this question
      });
    });
    
    // Add default marks (1 mark each) for questions not in any custom scheme
    const questionsInCustomSchemes = questionsInSchemes.size;
    const questionsWithDefaultMarking = numQuestions - questionsInCustomSchemes;
    totalFromSchemes += questionsWithDefaultMarking * 1; // 1 mark per default question
    
    return totalFromSchemes;
  };

  useEffect(() => {
    // Auto-calculate and prefill MCQ total marks based on marking schemes
    const calculatedMcqMarks = calculateMcqTotalFromSchemes();
    setMcqTotalMarks(calculatedMcqMarks);
    
    // Auto-calculate and prefill overall total marks
    const calculatedTotal = calculatedMcqMarks + (includeParsonsProblem ? parsonsTotalMarks : 0);
    setTotalMarks(calculatedTotal);
    
    updateQuestions();
  }, [numQuestions, numOptions, updateQuestions, includeParsonsProblem, parsonsTotalMarks, markingSchemes]);

  // Separate useEffect for Parsons initialization to avoid dependency issues
  useEffect(() => {
    if (includeParsonsProblem && parsonsPositions && (!parsonsInitializedRef.current || parsonsAnswerKey.length !== parsonsPositions)) {
      const initialKey = Array.from({ length: parsonsPositions }, (_, i) => ({ position: i + 1, itemNumber: '' }));
      setParsonsAnswerKey(initialKey);
      parsonsInitializedRef.current = true;
    } else if (!includeParsonsProblem) {
      // Clear the array if Parsons is disabled
      setParsonsAnswerKey([]);
      parsonsInitializedRef.current = false;
    }
  }, [includeParsonsProblem, parsonsPositions, parsonsAnswerKey.length]);

  const handleSelectChange = (values) => {
    // Additional validation to ensure no used questions are selected
    const usedQuestions = getUsedQuestions();
    const validValues = values.filter(value => !usedQuestions.has(value));
    
    setCustomScheme((prev) => ({
      ...prev,
      questions: validValues,
    }));
  };

  const addNewQuestion = () => {
    setNumQuestions((prev) => prev + 1);
  };

  const handleAddCustomScheme = () => {
    if (customScheme.questions.length === 0) {
      setShowAlert(true);
      return;
    }
    
    // Check for duplicate questions across existing schemes
    const usedQuestions = getUsedQuestions();
    const duplicateQuestions = customScheme.questions.filter(question => usedQuestions.has(question));
    
    if (duplicateQuestions.length > 0) {
      // This shouldn't happen with our filtering, but just in case
      alert(`Questions ${duplicateQuestions.join(', ')} are already used in other marking schemes.`);
      return;
    }
    
    setShowAlert(false);

    const formattedQuestions = customScheme.questions.map((q) => `q${q.split(" ")[1]}`);

    setMarkingSchemes((prev) => [
      ...prev,
      {
        questions: formattedQuestions,
        correct: Math.abs(customScheme.correct),
        incorrect: -Math.abs(customScheme.incorrect),
        unmarked: -Math.abs(customScheme.unmarked),
      },
    ]);
    setShowCustomSchemeModal(false);
    setCustomScheme({
      questions: [],
      correct: 0,
      incorrect: 0,
      unmarked: 0,
    });
  };

  const handleSchemeChange = (index, field, value) => {
    setMarkingSchemes((prev) => {
      const newSchemes = [...prev];
      newSchemes[index] = {
        ...newSchemes[index],
        [field]: field === "correct" ? Math.abs(value) : -Math.abs(value),
      };
      return newSchemes;
    });
  };

  const handleDeleteScheme = (index) => {
    setMarkingSchemes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleParsonsAnswerChange = (position, value) => {
    setParsonsAnswerKey((prev) => {
      const updated = prev.map((item) =>
        item.position === position ? { ...item, itemNumber: value } : item
      );
      console.log("Updated Parsons answer key:", updated);
      return updated;
    });
  };
  
  const handleFileSelect = () => {
    fileInputRef.current.click();
  };
  
  const processCsvImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if it's a CSV file
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      setCsvImportAlert({
        show: true,
        message: "Please upload a CSV or TXT file",
        type: "error"
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const lines = content.split(/\r\n|\n/).filter(line => line.trim()); // Filter out empty lines
        
        // Check if there are more lines than questions
        let tooManyLines = false;
        if (lines.length > numQuestions) {
          tooManyLines = true;
        }
        
        // Validate all answers first
        const invalidAnswers = [];
        const validOptions = Array.from({ length: numOptions }, (_, i) => String.fromCharCode(65 + i));
        
        for (let i = 0; i < Math.min(lines.length, numQuestions); i++) {
          const line = lines[i];
          const cells = line.split(/[,\t ]+/).filter(Boolean);
          
          for (const cell of cells) {
            const answer = cell.trim().toUpperCase();
            if (!validOptions.includes(answer)) {
              invalidAnswers.push({
                line: i + 1,
                answer: answer
              });
            }
          }
        }
        
        // If there are invalid answers, show error and don't import
        if (invalidAnswers.length > 0) {
          const samples = invalidAnswers.slice(0, 3).map(item => 
            `"${item.answer}" in line ${item.line}`
          ).join(", ");
          
          setCsvImportAlert({
            show: true,
            message: `Invalid answers found: ${samples}${invalidAnswers.length > 3 ? ' and more' : ''}. Valid options are ${validOptions.join(', ')}. No answers were imported.`,
            type: "error"
          });
          return;
        }
        
        // Parse valid answers
        const answers = [];
        
        for (let i = 0; i < Math.min(lines.length, numQuestions); i++) {
          const questionNumber = i + 1;
          const line = lines[i];
          const cells = line.split(/[,\t ]+/).filter(Boolean);
          
          // For each cell in the line, add it as an answer for this question
          for (const cell of cells) {
            const answer = cell.trim().toUpperCase();
            answers.push({ [`q${questionNumber}`]: answer });
          }
        }
        
        if (answers.length === 0) {
          setCsvImportAlert({
            show: true,
            message: "No valid answers found in the file",
            type: "error"
          });
          return;
        }
        
        // Update selected options
        setSelectedOptions(answers);
        
        // Show success message with warning if needed
        let message = `Successfully imported ${answers.length} answers`;
        if (tooManyLines) {
          message += `. Note: The file contained ${lines.length} lines but only the first ${numQuestions} questions were imported.`;
        }
        
        setCsvImportAlert({
          show: true,
          message: message,
          type: "success"
        });
        
        // Clear the file input
        event.target.value = null;
        
      } catch (error) {
        setCsvImportAlert({
          show: true,
          message: `Error processing file: ${error.message}`,
          type: "error"
        });
      }
    };
    
    reader.onerror = () => {
      setCsvImportAlert({
        show: true,
        message: "Error reading the file",
        type: "error"
      });
    };
    
    reader.readAsText(file);
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
    <h1 className="flex-1 text-3xl font-semibold tracking-tight">Manual Exam Key</h1>
    <div className="flex items-center gap-2 ml-auto">
      <Link
        to="/ExamControls"
        state={{
          classID: classID,
          examTitle: examTitle,
          questions: selectedOptions,
          numQuestions: numQuestions,
          totalMarks: totalMarks,
          mcqTotalMarks: mcqTotalMarks,
          parsonsTotalMarks: parsonsTotalMarks,
          markingSchemes: markingSchemes,
          template: template,
          templateId: templateId,
          parsonsAnswerKey: includeParsonsProblem ? parsonsAnswerKey : null,
          includeParsonsProblem: includeParsonsProblem,
          parsonsMaxScore: parsonsTotalMarks, // Use the manually set total marks
        }}
        onClick={() => {
          console.log("Navigating to ExamControls with Parsons answer key:", parsonsAnswerKey);
        }}
      >
        <Button size="icon" className="h-10 w-10">
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  </div>

      <div className="flex flex-row gap-8 w-full">
        <Card className="bg-white border rounded-lg p-6 w-full md:w-1/2">
          <CardHeader className="flex justify-between px-6 py-4">
            <CardTitle>Questions</CardTitle>
            <CardDescription>Configure exam questions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Label htmlFor="num-questions" className="block text-sm font-medium text-gray-700">
                #Questions
              </Label>
              <Input
                type="number"
                id="num-questions"
                className="mt-1 block w-full"
                value={numQuestions}
                onChange={(e) => setNumQuestions(Math.min(300, parseInt(e.target.value) || 10))}
                min="1"
                max="300"
                data-testid="num-questions-input"
              />
            </div>
            <div className="mb-4">
              <Label htmlFor="num-options" className="block text-sm font-medium text-gray-700">
                #Options per question
              </Label>
              <Input
                type="number"
                id="num-options"
                className="mt-1 block w-full"
                value={numOptions}
                onChange={(e) => setNumOptions(Math.min(26, parseInt(e.target.value) || 5))}
                min="1"
                max="26"
                data-testid="num-options-input"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border rounded-lg w-full md:w-1/2 p-6">
          <CardHeader className="flex justify-between px-6 py-4">
            <CardTitle>Custom Marking Scheme</CardTitle>
            <CardDescription>Set the marking scheme for your questions. By default, the total mark match the number of questions. You can adjust the total mark manually below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Questions</TableHead>
                  <TableHead>Correct</TableHead>
                  <TableHead>Incorrect</TableHead>
                  <TableHead>Blank</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markingSchemes.map((scheme, index) => (
                  <TableRow key={index}>
                    <TableCell>{scheme.questions.join(", ")}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={scheme.correct}
                        className="w-full"
                        onChange={(e) => handleSchemeChange(index, "correct", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={scheme.incorrect}
                        className="w-full"
                        onChange={(e) => handleSchemeChange(index, "incorrect", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={scheme.unmarked}
                        className="w-full"
                        onChange={(e) => handleSchemeChange(index, "unmarked", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteScheme(index)}>
                        <TrashIcon className="h-5 w-5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="justify-center border-t p-4">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setShowCustomSchemeModal(true)}
            >
              <PlusCircleIcon className="h-3.5 w-3.5" />
              Add Custom Marking Scheme
            </Button>
          </CardFooter>
          <div className="mt-4 space-y-4"> 
          <div>
            <Label>
              MCQ Total Marks
              <span className="text-xs text-gray-500 ml-2">
                (Calculated: {calculateMcqTotalFromSchemes()})
              </span>
            </Label>
            <Input
              type="number"
              value={mcqTotalMarks}
              className="w-20"
              onChange={(e) => {
                const newMcqMarks = parseInt(e.target.value) || 0;
                setMcqTotalMarks(newMcqMarks);
                setTotalMarks(newMcqMarks + (includeParsonsProblem ? parsonsTotalMarks : 0));
              }}
              title={`Auto-calculated based on marking schemes: ${calculateMcqTotalFromSchemes()}`}
            />
          </div>
          {includeParsonsProblem && (
            <div>
              <Label>
                Parsons Problem Total Marks
              </Label>
              <Input
                type="number"
                value={parsonsTotalMarks}
                className="w-20"
                onChange={(e) => {
                  const newParsonsMarks = parseInt(e.target.value) || 0;
                  setParsonsTotalMarks(newParsonsMarks);
                  setTotalMarks(mcqTotalMarks + newParsonsMarks);
                }}
              />
            </div>
          )}
          <div>
            <Label>
              Overall Total Marks
              <span className="text-xs text-gray-500 ml-2">
                (Calculated: {mcqTotalMarks + (includeParsonsProblem ? parsonsTotalMarks : 0)})
              </span>
            </Label>
            <Input
              type="number"
              value={totalMarks}
              className="w-20"
              onChange={(e) => {
                const newTotal = parseInt(e.target.value) || 0;
                setTotalMarks(newTotal);
              }}
              title={`Auto-calculated: ${mcqTotalMarks + (includeParsonsProblem ? parsonsTotalMarks : 0)}`}
            />
          </div>
        </div>
        </Card>
      </div>

      {/* Parsons Problem Answer Key Section */}
      {includeParsonsProblem && (
        <Card className="bg-white border rounded-lg w-full md:w-full p-6">
          <CardHeader>
            <CardTitle>Parsons Problem Answer Key</CardTitle>
            <CardDescription>
              Set the correct sequence for the code ordering problem. 
              Enter the item numbers in the order they should appear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {parsonsAnswerKey.map((item) => (
                <div key={item.position} className="space-y-2">
                  <Label htmlFor={`pos-${item.position}`} className="text-sm font-medium">
                    Position {item.position}
                  </Label>
                  <Input
                    id={`pos-${item.position}`}
                    type="number"
                    min="1"
                    max="999"
                    placeholder="Item #"
                    value={item.itemNumber}
                    onChange={(e) => handleParsonsAnswerChange(item.position, e.target.value)}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Which item should be in {item.position === 1 ? '1st' : item.position === 2 ? '2nd' : item.position === 3 ? '3rd' : `${item.position}th`} position
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900">Example:</h4>
              <p className="text-sm text-blue-800 mt-1">
                If your code items are numbered 1-20 and the correct sequence is items 3, 7, 1, 12, then enter:
                Position 1: 3, Position 2: 7, Position 3: 1, Position 4: 12
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white border rounded-lg w-full md:w-full p-0 md:h-auto">
        <CardHeader className="flex flex-row items-center bg-muted/50 px-6 py-4 w-full">
          <div>
            <CardTitle>Bubble Grid</CardTitle>
            <CardDescription>Select the answers</CardDescription>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv,.txt"
              onChange={processCsvImport} 
            />
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={handleFileSelect}
              >
                <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                Import CSV
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7">
                      <QuestionMarkCircleIcon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>Import a CSV file with answer keys. Format your file with each row containing one answer, without a header row. For example:</p>
                    <pre className="mt-1 bg-slate-100 p-1 rounded text-xs">
                      A<br />
                      B<br />
                      C<br />
                      ...
                    </pre>
                    <p className="mt-1 text-xs">Each cell will be treated as an answer for a question, in sequence.</p>
                    <p className="mt-1 text-xs">Multiple answers per question can be included on the same line separated by commas (e.g., "A, B, C").</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[48rem] flex items-center justify-center p-6">
          {csvImportAlert.show && (
            <Alert className="absolute top-4 right-4 z-50 max-w-md" variant={csvImportAlert.type === "error" ? "destructive" : "default"}>
              {csvImportAlert.type === "error" ? (
                <ExclamationCircleIcon className="h-4 w-4" />
              ) : (
                <div className="h-4 w-4 rounded-full bg-green-500"></div>
              )}
              <AlertTitle>{csvImportAlert.type === "error" ? "Error" : "Success"}</AlertTitle>
              <AlertDescription>{csvImportAlert.message}</AlertDescription>
              <Button 
                size="sm" 
                variant="ghost" 
                className="absolute top-2 right-2 h-6 w-6 p-0"
                onClick={() => setCsvImportAlert({...csvImportAlert, show: false})}
              >
                ×
              </Button>
            </Alert>
          )}
          <ScrollArea className="h-full w-full">
            <Form className="h-full w-full flex items-center justify-center">
              <div className="nested-window w-full">
                <div className="bubble-grid h-full" data-testid="bubble-grid"></div>
              </div>
            </Form>
          </ScrollArea>
        </CardContent>
      </Card>

      {showCustomSchemeModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md">
            {showAlert && (
              <Alert className="mb-4">
                <ExclamationCircleIcon className="h-4 w-4" />
                <AlertTitle>Heads up!</AlertTitle>
                <AlertDescription>Please select a question.</AlertDescription>
              </Alert>
            )}
            <h2 className="text-lg font-semibold mb-4">Add Custom Marking Scheme</h2>
            <div className="mb-4">
              <Label>Questions</Label>
              <MultiSelect
                options={frameworks}
                onValueChange={handleSelectChange}
                defaultValue={customScheme.questions}
                placeholder="Select questions..."
                variant="inverted"
                maxCount={10}
                animation={2}
              />
            </div>
            <div className="mb-4">
              <Label>
                Correct
                <PlusIcon className="h-5 w-5" />
              </Label>
              <Input
                type="number"
                value={customScheme.correct}
                onChange={(e) => setCustomScheme({ ...customScheme, correct: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <Label>
                Incorrect
                <MinusIcon className="h-5 w-5" />
              </Label>
              <Input
                type="number"
                value={customScheme.incorrect}
                onChange={(e) => setCustomScheme({ ...customScheme, incorrect: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <Label>
                Blank
                <MinusIcon className="h-5 w-5" />
              </Label>
              <Input
                type="number"
                value={customScheme.unmarked}
                onChange={(e) => setCustomScheme({ ...customScheme, unmarked: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCustomSchemeModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCustomScheme}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default ManualExamKey;
