import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import React, { useCallback, useMemo, useState } from "react";

export const AnswerGrid = ({ totalQuestions, correctAnswers, studentAnswers }) => {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [confirmations, setConfirmations] = useState({});

  const handleAnswerClick = (questionKey, option) => {
    setSelectedAnswers(prev => {
      const newSelectedAnswers = { ...prev };
      if (newSelectedAnswers[questionKey]?.includes(option)) {
        newSelectedAnswers[questionKey] = newSelectedAnswers[questionKey].filter(ans => ans !== option);
        if (newSelectedAnswers[questionKey].length === 0) {
          delete newSelectedAnswers[questionKey];
        }
      } else {
        newSelectedAnswers[questionKey] = [...(newSelectedAnswers[questionKey] || []), option];
      }
      return newSelectedAnswers;
    });
  };

  const handleConfirmClick = (questionKey) => {
    setConfirmations(prev => ({
      ...prev,
      [questionKey]: true
    }));
  };
  const handleUndoClick = (questionKey) => {
    setSelectedAnswers(prev => {
      const newSelectedAnswers = { ...prev };
      delete newSelectedAnswers[questionKey];
      return newSelectedAnswers;
    });
    setConfirmations(prev => {
      const newConfirmations = { ...prev };
      delete newConfirmations[questionKey];
      return newConfirmations;
    });
  };

  const allSelectedConfirmed = Object.keys(selectedAnswers).every(qKey => confirmations[qKey]);


  const handleSubmit = () => {
    const modifiedAnswers = Object.keys(selectedAnswers).reduce((acc, key) => {
      acc[key] = selectedAnswers[key];
      return acc;
    }, {});

    console.log("Submitting Answers:", JSON.stringify(modifiedAnswers, null, 2));
  };

  const formatAnswers = useCallback(() => {
    const formatted = {
      correct: {},
      student: {}
    };

    // Format correct answers from [{q1:A},{q2:B}] to {q1:A,q2:B}
    if (Array.isArray(correctAnswers)) {
      correctAnswers.forEach(answers => {
        const[[key, value]] = Object.entries(answers);
        formatted.correct[key] = value;
      })
    }

    // Format student answers from [{q1:A},{q2:B}] to {q1:A,q2:B}
    studentAnswers?.forEach(answer => {
      const [[key, value]] = Object.entries(answer);
      formatted.student[key] = value;
    });

    return formatted;
  }, [correctAnswers, studentAnswers]);

  const answers = useMemo(() => formatAnswers(), [formatAnswers]);
  return (
    <Card className="bg-white border rounded-lg w-full">
      <CardHeader className="flex flex-row items-center bg-muted/50 px-6 py-4">
        <CardTitle>Answer Comparison</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px] p-6">
        <ScrollArea className="h-full w-full">
          <div className="answer-bubble-grid space-y-2">
            {Array.from({ length: totalQuestions }, (_, i) => {
              const qKey = `q${i + 1}`;
              return (
                <div key={qKey} className="question mb-4 flex items-center">
                  <span className="w-8">{i + 1})</span>
                  <div className="options flex space-x-2">
                    {["A", "B", "C", "D", "E"].map(option => {
                      const isCorrect = answers.correct[qKey] === option;
                      const isStudentAnswer = answers.student[qKey] === option;
                      const isSelected = selectedAnswers[qKey]?.includes(option);
                      const isConfirmed = confirmations[qKey];
                      
                      let classNames = [];

                      if (isCorrect && isStudentAnswer && isSelected) {
                        classNames = ["bg-green-600", "text-white", "border-2", "border-blue-700"]; // Correct, Student's answer, and Selected
                      } else if (isCorrect && isStudentAnswer) {
                        classNames = ["bg-green-500", "text-white"]; // Correct and Student's answer
                      } else if (isCorrect && isSelected) {
                        classNames = ["bg-green-400", "text-white", "border-2", "border-blue-700"]; // Correct and Selected
                      } else if (isStudentAnswer && isSelected) {
                        classNames = ["bg-red-600", "text-white", "border-2", "border-blue-700"]; // Student's answer and Selected
                      } else if (isCorrect) {
                        classNames = ["bg-green-300", "text-black"]; // Correct only
                      } else if (isStudentAnswer) {
                        classNames = ["bg-red-500", "text-white"]; // Student's answer only
                      } else if (isSelected) {
                        classNames = ["bg-blue-500", "text-white", "border-2", "border-blue-700"]; // Selected only
                      }

                      const className = ["option px-3 py-1 border rounded-full text-sm cursor-pointer", ...classNames].join(" ");
                      


                      return (
                        <div
                          key={option}
                          className={className}
                          onClick={() => handleAnswerClick(qKey, option)}
                        >
                          {option}
                        </div>
                      );
                    })}
                  </div>
                  {selectedAnswers[qKey] && !confirmations[qKey] && (
                    <>
                    <button
                      className="ml-4 px-3 py-1 bg-blue-500 text-white rounded-full"
                      onClick={() => handleConfirmClick(qKey)}
                    >
                      Confirm
                    </button>
                    <button
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded-full"
                      onClick={() => handleUndoClick(qKey)}
                    >
                      Undo
                    </button>
                    </>
                  )}
                  {confirmations[qKey] && selectedAnswers[qKey] !== answers.student[qKey] && (
                    <button
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded-full"
                      onClick={() => handleUndoClick(qKey)}
                    >
                      Undo
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
        {allSelectedConfirmed && (
          <button
            className="mt-4 px-4 py-2 bg-green-600 text-white font-bold rounded-lg w-full"
            onClick={handleSubmit}
          >
            Submit Answers
          </button>
        )}
      </CardContent>
    </Card>
  );
};
